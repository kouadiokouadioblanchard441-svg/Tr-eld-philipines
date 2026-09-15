import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { pool as databasePool } from "./db";
import bcrypt from "bcrypt";
import { registerSchema, loginSchema, depositSchema, phoneNumberSchema, identityVerificationSchema, TASK_CONDITION_TYPES, type TaskConditionType } from "@shared/schema";
import { z } from "zod";
import ConnectPgSimple from "connect-pg-simple";
import { 
  initiatePayment, 
  verifyPayment, 
  isSoleaspaySupported, 
  mapSoleaspayStatus,
  SOLEASPAY_SERVICE_MAP 
} from "./soleaspay";
import {
  createPayment as sendavapayCreate,
  initiatePayment as sendavapayInitiate,
  submitOtp as sendavapaySubmitOtp,
  retryPayment as sendavapayRetry,
  verifyPayment as sendavapayVerify,
  verifyWebhookSignature as sendavapayVerifySignature,
  mapSendavapayStatus,
  formatPhone as sendavapayFormatPhone,
  getCurrency as sendavapayGetCurrency,
  toSendavapayCountry,
} from "./sendavapay";
import {
  buildPaymentUrl as westpayBuildUrl,
  verifyWebhookSignature as westpayVerifySignature,
  transfer as westpayTransfer,
  formatMsisdn as westpayFormatMsisdn,
} from "./westpay";
import {
  collectPayment as ashtechCollect,
  getCountries as ashtechGetCountries,
  getTransaction as ashtechGetTransaction,
  isAshtechConfigured,
  mapAshtechStatus,
  AshtechApiError,
} from "./ashtechpay";
import { formatTelegramValue, sendTelegramMessage, sendTelegramSecurityAlert } from "./telegram";
import express from "express";
import {
  createAdminSupportConversationsHandler,
  createAdminSupportMessageEditHandler,
} from "./support-message-edit";

// --- Brute-force protection (in-memory) ---
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function getClientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress || "unknown";
  return ip;
}

function isValidNewsImage(imageUrl: string): boolean {
  const isDataImage = /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageUrl);
  const isRemoteImage = /^https:\/\/[^\s]+$/i.test(imageUrl);
  return isDataImage || isRemoteImage;
}

function parseNewsCount(value: unknown, label: string, fallback?: number): number | undefined {
  if (value === undefined) return fallback;
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(count) || count < 0 || count > 1_000_000_000) {
    throw new Error(`${label} doit être un nombre entier positif ou nul`);
  }
  return count;
}

function countNewsWords(content: string): number {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
}

const MIN_NEWS_WORDS = 1206;

const SUPPORT_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

function parseSupportMessageBody(body: any) {
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const attachmentData = typeof body?.attachmentData === "string" && body.attachmentData.trim()
    ? body.attachmentData.trim()
    : null;
  const attachmentName = typeof body?.attachmentName === "string"
    ? body.attachmentName.replace(/[\\/]/g, "_").trim().slice(0, 160)
    : "";

  if (!message && !attachmentData) {
    throw new Error("Écrivez un message ou ajoutez une pièce jointe");
  }
  if (message.length > 5000) {
    throw new Error("Le message ne doit pas dépasser 5 000 caractères");
  }
  if (!attachmentData) {
    return { message, attachmentName: null, attachmentMimeType: null, attachmentData: null };
  }

  const match = attachmentData.match(/^data:([^;]+);base64,[A-Za-z0-9+/=]+$/);
  const mimeType = match?.[1]?.toLowerCase();
  if (!mimeType || !SUPPORT_ATTACHMENT_MIME_TYPES.has(mimeType)) {
    throw new Error("Type de fichier non pris en charge");
  }
  if (attachmentData.length > 8000000) {
    throw new Error("La pièce jointe ne doit pas dépasser 6 Mo");
  }

  return {
    message,
    attachmentName: attachmentName || "Pièce jointe",
    attachmentMimeType: mimeType,
    attachmentData,
  };
}

function checkBruteForce(req: Request, res: Response): boolean {
  const key = getClientKey(req);
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (record && record.blockedUntil > now) {
    const minutesLeft = Math.ceil((record.blockedUntil - now) / 60000);
    res.status(429).json({ message: `Too many attempts. Try again in ${minutesLeft} minute(s).` });
    return true;
  }
  return false;
}

function recordFailedAttempt(req: Request) {
  const key = getClientKey(req);
  const now = Date.now();
  const record = loginAttempts.get(key) || { count: 0, blockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
    record.count = 0;
    void sendTelegramSecurityAlert(
      key,
      "Too many attempts. Try again in 15 minute(s).",
    ).catch((error) => console.error("[telegram] security notification failed:", error.message));
  }
  loginAttempts.set(key, record);
}

function clearFailedAttempts(req: Request) {
  loginAttempts.delete(getClientKey(req));
}

function getBlockedIps(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function getRouteParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getPublicAppBaseUrl(req: Request): string {
  const configuredUrl = process.env.PUBLIC_APP_URL?.trim();
  if (configuredUrl) {
    try {
      const parsedUrl = new URL(configuredUrl);
      if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
        return parsedUrl.origin;
      }
    } catch {
      console.warn("[app url] Invalid PUBLIC_APP_URL, using the request URL");
    }
  }

  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol === "https" ? "https" : req.protocol;
  return `${protocol}://${req.get("host")}`;
}
// --- end brute-force protection ---

async function creditApprovedDeposit(deposit: { id: number; userId: number; amount: number }) {
  const user = await storage.getUser(deposit.userId);
  if (!user) return;

  await storage.updateUser(user.id, {
    balance: (parseFloat(user.balance) + deposit.amount).toFixed(2),
    hasDeposited: true,
  });
  await storage.createTransaction({
    userId: user.id,
    type: "deposit",
    amount: deposit.amount.toString(),
    description: `RobotPay deposit #${deposit.id}`,
  });
  await storage.processDepositReferralCommissions(user.id, deposit.amount);
  void sendTelegramMessage(
    [
      "✅ <b>Deposit approved</b>",
      `User: ${formatTelegramValue(user.fullName)}`,
      `Amount: <b>${formatTelegramValue(deposit.amount)} GPB</b>`,
      `Reference: ${formatTelegramValue(deposit.id)}`,
      `Country: ${formatTelegramValue(user.country)}`,
    ].join("\n"),
  ).catch((error) => console.error("[telegram] deposit notification failed:", error.message));
}

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const PgSession = ConnectPgSimple(session);
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be configured.");
}

function saveAuthenticatedSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

const SENSITIVE_SETTING_KEYS = new Set([
  "sendavapayWebhookSecret",
  "omnipayCallbackKey",
  "westpayWebhookSecret",
  "ashtechWebhookSecret",
]);
const PUBLIC_SETTING_KEYS = new Set([
  "supportLink", "supportType", "supportLabel",
  "support2Link", "support2Type", "support2Label",
  "channelLink", "channelType", "channelLabel",
  "groupLink", "groupType", "groupLabel", "noticeText",
  "supportEnabled", "support2Enabled", "channelEnabled", "groupEnabled",
  "minDeposit", "minWithdrawal", "depositConversionRate", "withdrawalConversionRate", "withdrawalFees",
  "maxWithdrawalsPerDay", "withdrawalStartHour", "withdrawalEndHour",
  "level1Commission", "level2Commission", "level3Commission",
  "sendavapayEnabled", "sendavapayChannelName",
  "westpayEnabled", "westpayChannelName", "westpayCountries",
  "ashtechEnabled", "ashtechChannelName", "ashtechCountries",
]);
const ADMIN_SETTING_KEYS = new Set([
  ...Array.from(PUBLIC_SETTING_KEYS),
]);
const MASKED_SETTING_VALUE = "********";
const LINK_SETTING_KEYS = new Set([
  "supportLink",
  "support2Link",
  "channelLink",
  "groupLink",
]);
const REMOVED_LEGACY_HOSTS = new Set([
  "tonnew.top",
  "sybotx.replit.app",
  "intel.replit.app",
]);
const REMOVED_LEGACY_LINKS = new Set([
  "https://t.me/sybotx",
  "https://t.me/intelappgroup",
]);

function sanitizeSettings(settings: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => {
      if (!LINK_SETTING_KEYS.has(key)) return [key, value];

      try {
        const parsed = new URL(value);
        if (REMOVED_LEGACY_HOSTS.has(parsed.hostname) || REMOVED_LEGACY_LINKS.has(parsed.href)) {
          return [key, ""];
        }
      } catch {
        // Leave non-URL values unchanged; validation belongs to the settings form.
      }

      return [key, value];
    }),
  );
}

function publicSettings(settings: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(sanitizeSettings(settings)).filter(([key]) => PUBLIC_SETTING_KEYS.has(key)),
  );
}

function adminSettings(settings: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(sanitizeSettings(settings))
      .filter(([key]) => ADMIN_SETTING_KEYS.has(key))
      .map(([key, value]) => [
      key,
      SENSITIVE_SETTING_KEYS.has(key) && value ? MASKED_SETTING_VALUE : value,
      ]),
  );
}

function validatePhone(value: unknown, fieldName: string): string {
  const result = phoneNumberSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`${fieldName} invalide`);
  }
  return result.data;
}

function parseCountryOperators(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((operator): operator is string => typeof operator === "string" && operator.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

async function getActiveCountry(code: unknown) {
  if (typeof code !== "string") return undefined;
  const normalizedCode = code.trim().toUpperCase();
  const countries = await storage.getActiveCountries();
  return countries.find((country) => country.code === normalizedCode);
}

async function isActiveCountryOperator(countryCode: unknown, operator: unknown): Promise<boolean> {
  if (typeof operator !== "string") return false;
  const country = await getActiveCountry(countryCode);
  if (!country) return false;
  const normalized = operator.trim().toLocaleLowerCase();
  return parseCountryOperators(country.operators).some((item) => item.trim().toLocaleLowerCase() === normalized);
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user?.isAdmin) {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
}

async function requireBanker(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user?.isAdmin && !user?.isBanker) {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Trust proxy for production HTTPS (Replit deployment)
  app.set("trust proxy", 1);

  app.use(
    session({
      store: new PgSession({
        pool: databasePool,
        tableName: "session",
        createTableIfMissing: true,
        pruneSessionInterval: 60 * 60,
      }),
       secret: sessionSecret as string,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      },
    })
  );

  app.use(async (req, res, next) => {
    try {
      const blockedIps = getBlockedIps(await storage.getSetting("blockedIps"));
      if (blockedIps.includes(getClientKey(req))) {
        return res.status(403).json({ message: "Access blocked for this IP address" });
      }
      next();
    } catch (error) {
      console.error("[security] IP block check failed:", error);
      next();
    }
  });

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      if (!await getActiveCountry(data.country)) {
        return res.status(400).json({ message: "This country is not currently available" });
      }
      
      const existing = await storage.getUserByPhone(data.phone, data.country);
      if (existing) {
        return res.status(400).json({ message: "This number is already in use" });
      }

      let referredBy: string | undefined;
      if (data.invitationCode && data.invitationCode.trim()) {
        const cleanCode = data.invitationCode.trim().toUpperCase();
        const referrer = await storage.getUserByReferralCode(cleanCode);
        if (!referrer) {
          return res.status(400).json({ message: "Code d'invitation invalide" });
        }
        referredBy = cleanCode;
      }

      const user = await storage.createUser({
        fullName: data.fullName,
        phone: data.phone,
        country: data.country,
        password: data.password,
        referredBy,
      });

      req.session.userId = user.id;
      await saveAuthenticatedSession(req);
      res.json({ user: { ...user, password: undefined } });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: error.message || "Server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    if (checkBruteForce(req, res)) return;
    try {
      const data = loginSchema.parse(req.body);
      if (!await getActiveCountry(data.country)) {
        return res.status(400).json({ message: "This country is not currently available" });
      }
      
      let user = await storage.getUserByPhone(data.phone, data.country);

      // Administrators may select any country at login. Regular users must
      // still authenticate with the country saved on their account.
      if (!user) {
        const adminCandidate = await storage.getUserByPhoneAnyCountry(data.phone);
        if (adminCandidate?.isAdmin) {
          user = adminCandidate;
        }
      }

      if (!user) {
        recordFailedAttempt(req);
        return res.status(400).json({ message: "Identifiants incorrects" });
      }

      const validPassword = await bcrypt.compare(data.password, user.password);
      if (!validPassword) {
        recordFailedAttempt(req);
        return res.status(400).json({ message: "Identifiants incorrects" });
      }

      if (user.isBanned) {
        return res.status(403).json({ message: "Account suspended" });
      }

      clearFailedAttempts(req);
      req.session.userId = user.id;
      await saveAuthenticatedSession(req);
      if (user.isAdmin) {
        void sendTelegramMessage(
          [
            "🔐 <b>Connexion administrateur</b>",
            `Administrateur : ${formatTelegramValue(user.fullName)}`,
            `Country: ${formatTelegramValue(user.country)}`,
            `Adresse IP : ${formatTelegramValue(getClientKey(req))}`,
          ].join("\n"),
        ).catch((error) => console.error("[telegram] admin login notification failed:", error.message));
      }
      res.json({ user: { ...user, password: undefined } });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: error.message || "Server error" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json({ user: { ...user, password: undefined } });
  });

  // Identity verification
  app.get("/api/identity-verification", requireAuth, async (req, res) => {
    try {
      const verification = await storage.getIdentityVerification(req.session.userId!);
      res.json({ verification: verification || null });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Unable to load identity verification" });
    }
  });

  app.post("/api/identity-verification", requireAuth, async (req, res) => {
    try {
      const data = identityVerificationSchema.parse(req.body);
      const verification = await storage.saveIdentityVerification({
        userId: req.session.userId!,
        fullName: data.fullName,
        idNumber: data.idNumber,
        idFront: data.idFront,
        idBack: data.idBack,
        selfie: data.selfie,
      });
      res.json({
        verification: {
          id: verification.id,
          fullName: verification.fullName,
          idNumber: verification.idNumber,
          status: verification.status,
          createdAt: verification.createdAt,
          updatedAt: verification.updatedAt,
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: error.message || "Unable to submit identity verification" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.post("/api/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Please fill in all fields" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "The new password must be at least 6 characters" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { password: hashedPassword });

      res.json({ success: true, message: "Password changed successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Server error" });
    }
  });

  // Products
  app.get("/api/products", requireAuth, async (req, res) => {
    try {
      const products = await storage.getProducts();
      const userProductsList = await storage.getUserProducts(req.session.userId!);
      const user = await storage.getUser(req.session.userId!);
      
      const productCounts = new Map<number, number>();
      userProductsList.forEach(up => {
        if (up.isActive) {
          productCounts.set(up.productId, (productCounts.get(up.productId) || 0) + 1);
        }
      });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const canClaimFree = !user?.lastFreeProductClaim || 
        new Date(user.lastFreeProductClaim) < today;

      const productsWithOwnership = products.map(p => ({
        ...p,
        isOwned: productCounts.has(p.id),
        ownedCount: productCounts.get(p.id) || 0,
        canClaimFree: p.isFree && canClaimFree,
      }));

      res.json(productsWithOwnership);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/products/:id/purchase", requireAuth, async (req, res) => {
    try {
      const productId = parseInt(getRouteParam(req, "id"));
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (product.isFree) {
        return res.status(400).json({ message: "Use /claim-free for this product" });
      }

      const userProduct = await storage.purchaseProduct(req.session.userId!, productId);
      res.json(userProduct);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/products/:id/claim-free", requireAuth, async (req, res) => {
    try {
      const productId = parseInt(getRouteParam(req, "id"));
      const product = await storage.getProduct(productId);
      
      if (!product || !product.isFree) {
        return res.status(400).json({ message: "Invalid product" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (user.lastFreeProductClaim && new Date(user.lastFreeProductClaim) >= today) {
        return res.status(400).json({ message: "Already claimed today" });
      }

      const newBalance = parseFloat(user.balance) + product.dailyEarnings;
      const newEarningsBalance = parseFloat(user.earningsBalance || "0") + product.dailyEarnings;
      await storage.updateUser(user.id, { 
        balance: newBalance.toFixed(2),
        earningsBalance: newEarningsBalance.toFixed(2),
        lastFreeProductClaim: new Date(),
      });

      await storage.createTransaction({
        userId: user.id,
        type: "free_claim",
        amount: product.dailyEarnings.toString(),
        description: "Free product bonus",
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get user's purchased products
  app.get("/api/user/products", requireAuth, async (req, res) => {
    try {
      const userProductsList = await storage.getAllUserProducts(req.session.userId!);
      
      const formattedProducts = userProductsList.map(up => ({
        id: up.userProduct.id,
        productId: up.userProduct.productId,
        purchasedAt: up.userProduct.purchaseDate,
        lastEarningDate: up.userProduct.lastEarningDate,
        daysRemaining: up.userProduct.daysRemaining,
        totalEarned: up.userProduct.totalEarned,
        status: up.userProduct.isActive ? 'active' : 'completed',
        product: up.product
      }));
      
      res.json(formattedProducts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Collect earnings for user (manual trigger)
  app.post("/api/user/collect-earnings", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const userProductsList = await storage.getAllUserProducts(userId);
      const now = new Date();
      let totalCollected = 0;
      let productsCollected = 0;

      for (const { userProduct, product } of userProductsList) {
        try {
          if (!userProduct.isActive || userProduct.daysRemaining <= 0) continue;

          const purchaseDate = userProduct.purchaseDate ? new Date(userProduct.purchaseDate) : null;
          if (!purchaseDate) continue;

          const lastEarning = userProduct.lastEarningDate ? new Date(userProduct.lastEarningDate) : purchaseDate;

          const msSincePurchase = now.getTime() - purchaseDate.getTime();
          const daysSincePurchase = Math.floor(msSincePurchase / (24 * 60 * 60 * 1000));

          const msSinceLastEarning = now.getTime() - lastEarning.getTime();
          const cyclesSinceLastEarning = Math.floor(msSinceLastEarning / (24 * 60 * 60 * 1000));

          if (cyclesSinceLastEarning >= 1 && daysSincePurchase >= 1) {
            const cyclesToCredit = Math.min(cyclesSinceLastEarning, userProduct.daysRemaining);
            const earningsPerCycle = product.dailyEarnings;
            const totalEarningsForProduct = earningsPerCycle * cyclesToCredit;

            const newLastEarningDate = new Date(lastEarning.getTime() + (cyclesToCredit * 24 * 60 * 60 * 1000));

            totalCollected += totalEarningsForProduct;
            productsCollected++;

            const newDaysRemaining = userProduct.daysRemaining - cyclesToCredit;
            const updateData: any = {
              lastEarningDate: newLastEarningDate,
              daysRemaining: newDaysRemaining,
              totalEarned: (parseFloat(userProduct.totalEarned || "0") + totalEarningsForProduct).toFixed(2),
            };
            
            if (newDaysRemaining <= 0) {
              updateData.isActive = false;
            }

            await storage.updateUserProduct(userProduct.id, updateData);

            for (let i = 0; i < cyclesToCredit; i++) {
              await storage.createTransaction({
                userId,
                type: "earning",
                amount: earningsPerCycle.toString(),
                description: `Gains ${product.name}`,
              });
            }
          }
        } catch (productError) {
          console.error(`Error processing product ${userProduct.id}:`, productError);
        }
      }

      if (totalCollected > 0) {
        const freshUser = await storage.getUser(userId);
        if (freshUser) {
          const newBalance = parseFloat(freshUser.balance || "0") + totalCollected;
          const newEarningsBalance = parseFloat(freshUser.earningsBalance || "0") + totalCollected;
          const newTodayEarnings = parseFloat(freshUser.todayEarnings || "0") + totalCollected;
          const newTotalEarnings = parseFloat(freshUser.totalEarnings || "0") + totalCollected;

          await storage.updateUser(userId, {
            balance: newBalance.toFixed(2),
            earningsBalance: newEarningsBalance.toFixed(2),
            todayEarnings: newTodayEarnings.toFixed(2),
            totalEarnings: newTotalEarnings.toFixed(2),
          });
        }
      }

      const updatedUser = await storage.getUser(userId);
      res.json({ 
        success: true, 
        collected: totalCollected,
        productsCollected,
        newBalance: updatedUser?.balance || "0"
      });
    } catch (error: any) {
      console.error("Collect earnings error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Payment Channels
  app.get("/api/payment-channels", requireAuth, async (req, res) => {
    try {
      const channels = await storage.getPaymentChannels();
      res.json(channels.map((channel) => ({ ...channel, gateway: null })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get Soleaspay supported services
  app.get("/api/soleaspay/services", requireAuth, async (req, res) => {
    try {
      res.json({ enabled: false, services: {}, enabledCountries: [] });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Staking Products (public)
  app.get("/api/staking/products", requireAuth, async (req, res) => {
    try {
      const all = await storage.getActiveStakingProducts();
      res.json(all);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/staking/purchase/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(getRouteParam(req, "id"));
      const staking = await storage.purchaseStaking(req.session.userId!, id);
      res.json(staking);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/staking/my", requireAuth, async (req, res) => {
    try {
      const stakings = await storage.getUserStakings(req.session.userId!);
      res.json(stakings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin Staking
  app.get("/api/admin/staking/products", requireAdmin, async (req, res) => {
    try {
      const all = await storage.getStakingProducts();
      res.json(all);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/staking/products", requireAdmin, async (req, res) => {
    try {
      const { name, description, price, returnAmount, lockDays, launchDate, imageUrl, isActive } = req.body;
      if (!name || !price || !returnAmount || !lockDays) {
        return res.status(400).json({ message: "Required fields: name, price, return, duration" });
      }
      const sp = await storage.createStakingProduct({
        name, description: description || null,
        price: parseInt(price),
        returnAmount: parseInt(returnAmount),
        lockDays: parseInt(lockDays),
        launchDate: launchDate ? new Date(launchDate) : null,
        imageUrl: imageUrl || null,
        isActive: isActive !== false,
        createdBy: req.session.userId,
      });
      res.json(sp);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/admin/staking/products/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(getRouteParam(req, "id"));
      const { name, description, price, returnAmount, lockDays, launchDate, imageUrl, isActive } = req.body;
      const sp = await storage.updateStakingProduct(id, {
        name, description,
        price: price !== undefined ? parseInt(price) : undefined,
        returnAmount: returnAmount !== undefined ? parseInt(returnAmount) : undefined,
        lockDays: lockDays !== undefined ? parseInt(lockDays) : undefined,
        launchDate: launchDate ? new Date(launchDate) : (launchDate === null ? null : undefined),
        imageUrl, isActive,
      });
      res.json(sp);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/staking/products/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteStakingProduct(parseInt(getRouteParam(req, "id")));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/staking/stakings", requireAdmin, async (req, res) => {
    try {
      const all = await storage.getAllUserStakings();
      res.json(all);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Payment Numbers (public — filtered by country)
  app.get("/api/payment-numbers", requireAuth, async (req, res) => {
    try {
      const country = String(req.query.country || "").toUpperCase();
      if (!await getActiveCountry(country)) {
        return res.status(400).json({ message: "Country unavailable" });
      }
      res.json(await storage.getPaymentNumbersByCountry(country));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin Payment Numbers CRUD
  app.get("/api/admin/payment-numbers", requireAdmin, async (req, res) => {
    try {
      const nums = await storage.getPaymentNumbers();
      res.json(nums);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/payment-numbers", requireAdmin, async (req, res) => {
    try {
      const { ownerName, phone, operatorName, country, logoUrl, isActive } = req.body;
      const countryCode = String(country || "").trim().toUpperCase();
      if (!ownerName || !phone || !operatorName || !await getActiveCountry(countryCode)) {
        return res.status(400).json({ message: "All fields are required" });
      }
      if (!await isActiveCountryOperator(countryCode, operatorName)) {
        return res.status(400).json({ message: "Add this operator to the country configuration first" });
      }
      const normalizedPhone = validatePhone(phone, "Number");
      const num = await storage.createPaymentNumber({
        ownerName: String(ownerName).trim().slice(0, 100),
        phone: normalizedPhone,
        operatorName: String(operatorName).trim().slice(0, 60),
        country: countryCode,
        logoUrl: logoUrl || null,
        isActive: isActive !== false,
        createdBy: req.session.userId,
      });
      res.json(num);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/admin/payment-numbers/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(getRouteParam(req, "id"));
      const { ownerName, phone, operatorName, country, logoUrl, isActive } = req.body;
      const existing = await storage.getPaymentNumbers().then((items) => items.find((item) => item.id === id));
      const countryCode = String(country ?? existing?.country ?? "").trim().toUpperCase();
      if (!await getActiveCountry(countryCode)) {
        return res.status(400).json({ message: "Country unavailable" });
      }
      if (operatorName !== undefined && !await isActiveCountryOperator(countryCode, operatorName)) {
        return res.status(400).json({ message: "Add this operator to the country configuration first" });
      }
      const num = await storage.updatePaymentNumber(id, {
        ownerName: ownerName === undefined ? undefined : String(ownerName).trim().slice(0, 100),
        phone: phone === undefined ? undefined : validatePhone(phone, "Number"),
        operatorName: operatorName === undefined ? undefined : String(operatorName).trim().slice(0, 60),
        country: country === undefined ? undefined : countryCode,
        logoUrl, isActive,
      });
      res.json(num);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/payment-numbers/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deletePaymentNumber(parseInt(getRouteParam(req, "id")));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Deposits
  app.post("/api/deposits", requireAuth, async (req, res) => {
    try {
      const { amount, accountName, accountNumber, paymentMethod, country, paymentChannelId, useSoleaspay, useWestpay, otpCode,
        paymentNumberId, channelName, screenshot, paymentMessage, reference } = req.body;
      const user = await storage.getUser(req.session.userId!);
      
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const activeUserCountry = await getActiveCountry(user.country);
      if (!activeUserCountry) {
        return res.status(400).json({ message: "Deposits are not available for this country" });
      }

      const settings = await storage.getSettings();
       const minDeposit = Number(settings.minDeposit);
       const depositConversionRate = Number(settings.depositConversionRate);
       if (!Number.isFinite(minDeposit) || minDeposit < 0 ||
           !Number.isFinite(depositConversionRate) || depositConversionRate <= 0) {
         return res.status(500).json({ message: "Les réglages de dépôt sont incomplets ou invalides" });
       }
       const requestedAmount = typeof amount === "number" ? amount : Number(amount);
       if (!Number.isFinite(requestedAmount) || requestedAmount < minDeposit) {
        return res.status(400).json({ message: `Minimum amount: ${minDeposit.toLocaleString()} GPB` });
      }
       if (!Number.isFinite(depositConversionRate) || depositConversionRate <= 0) {
         return res.status(500).json({ message: "Le taux de conversion du dépôt est invalide" });
       }
       const convertedAmount = Math.round(requestedAmount * depositConversionRate);

       const parsedDeposit = depositSchema.safeParse({
          amount: requestedAmount,
         accountName, accountNumber, paymentMethod, country,
         paymentChannelId: paymentChannelId === undefined ? undefined : Number(paymentChannelId),
       });
       if (!parsedDeposit.success) {
         return res.status(400).json({ message: parsedDeposit.error.errors[0]?.message || "Invalid data" });
       }
       if (screenshot !== undefined && screenshot !== null) {
         if (
           typeof screenshot !== "string" ||
           screenshot.length > 7_000_000 ||
           !/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(screenshot)
         ) {
           return res.status(400).json({ message: "Invalid or oversized screenshot (7 MB maximum)" });
         }
       }
       const normalizedDeposit = parsedDeposit.data;
       if (normalizedDeposit.country !== user.country || !await getActiveCountry(normalizedDeposit.country)) {
         return res.status(400).json({ message: "The deposit must be made for your account country" });
       }
       if (useSoleaspay) {
          return res.status(400).json({ message: "Soleaspay is not configured for this country. Use an available channel." });
       }
        if (!useWestpay && !useSoleaspay) {
          if (!await isActiveCountryOperator(normalizedDeposit.country, normalizedDeposit.paymentMethod)) {
            return res.status(400).json({ message: "This operator is not available in this country" });
         }
         if (!paymentNumberId) {
            return res.status(400).json({ message: "Select a payment number" });
         }
          const paymentNumbers = await storage.getPaymentNumbersByCountry(normalizedDeposit.country);
         const selectedPaymentNumber = paymentNumbers.find((item) =>
           item.id === Number(paymentNumberId) &&
           item.operatorName.trim().toLocaleLowerCase() === normalizedDeposit.paymentMethod.trim().toLocaleLowerCase(),
         );
         if (!selectedPaymentNumber) {
           return res.status(400).json({ message: "The selected payment number is unavailable" });
         }
          if (!screenshot) {
            return res.status(400).json({ message: "Add your payment screenshot before submitting" });
          }
       }

      const soleaspayEnabled = settings.soleaspayEnabled !== "false";
      const soleaspayCountries = settings.soleaspayCountries ? settings.soleaspayCountries.split(",").filter(Boolean) : [];
      const orderId = `JOLLIBEE-${Date.now()}-${user.id}`;
      
      // Only use Soleaspay when user explicitly chose the Soleaspay channel (Westpay)
      if (useSoleaspay && soleaspayEnabled) {
         if (!isSoleaspaySupported(normalizedDeposit.country, normalizedDeposit.paymentMethod)) {
          return res.status(400).json({
            message: `The operator "${normalizedDeposit.paymentMethod}" is not supported by this channel for country "${normalizedDeposit.country}". Please choose another channel.`,
            soleaspay: true,
          });
        }
        try {
          const paymentResult = await initiatePayment(
            normalizedDeposit.accountNumber,
             convertedAmount,
            normalizedDeposit.country,
            normalizedDeposit.paymentMethod,
            orderId,
            normalizedDeposit.accountName,
            `user${user.id}@${new URL(getPublicAppBaseUrl(req)).hostname}`,
            getPublicAppBaseUrl(req),
          );

          if (paymentResult.success && paymentResult.data) {
            const deposit = await storage.createDeposit({
              userId: req.session.userId!,
             amount: normalizedDeposit.amount,
             accountName: normalizedDeposit.accountName,
             accountNumber: normalizedDeposit.accountNumber,
             country: normalizedDeposit.country,
             paymentMethod: normalizedDeposit.paymentMethod,
               paymentChannelId: normalizedDeposit.paymentChannelId && normalizedDeposit.paymentChannelId > 0 ? normalizedDeposit.paymentChannelId : null,
              status: "processing",
              soleaspayReference: paymentResult.data.reference,
              soleaspayOrderId: orderId,
            });

            return res.json({ 
              deposit,
              soleaspay: true,
              reference: paymentResult.data.reference,
              status: paymentResult.status,
              message: paymentResult.message
            });
          } else {
            return res.status(400).json({ 
              message: paymentResult.message || "Soleaspay error",
              soleaspay: true
            });
          }
        } catch (soleaspayError: any) {
          console.error("[soleaspay] Payment error:", soleaspayError);
          return res.status(400).json({ 
            message: soleaspayError.message || "Soleaspay payment error",
            soleaspay: true
          });
        }
      }

      // ── WestPay: redirect-based hosted-payment flow ─────────────────────────
      const westpayEnabledDeposit = settings.westpayEnabled === "true";
      const westpayCountries = (settings.westpayCountries || "")
        .split(",")
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
       if (useWestpay && (!westpayEnabledDeposit || (westpayCountries.length > 0 && !westpayCountries.includes(normalizedDeposit.country)))) {
         return res.status(400).json({ message: "WestPay is not enabled for this country", westpay: true });
      }
      if (useWestpay && westpayEnabledDeposit) {
        try {
          if (!process.env.WESTPAY_MERCHANT_SLUG) {
            return res.status(400).json({ message: "WestPay is not configured: WESTPAY_MERCHANT_SLUG must be set on the server", westpay: true });
          }
          const baseUrl = getPublicAppBaseUrl(req);
          // Create deposit to get an ID, then build the redirect URL
          const deposit = await storage.createDeposit({
            userId: req.session.userId!,
            amount: normalizedDeposit.amount,
            accountName: normalizedDeposit.accountName || user.fullName,
            accountNumber: normalizedDeposit.accountNumber || user.phone,
            country: normalizedDeposit.country,
            paymentMethod: "WestPay",
            paymentChannelId: normalizedDeposit.paymentChannelId && normalizedDeposit.paymentChannelId > 0 ? normalizedDeposit.paymentChannelId : null,
            status: "pending",
          });
          const callbackUrl = `${baseUrl}/api/westpay/callback?depositId=${deposit.id}`;
          const westpayUrl = westpayBuildUrl({
             amount: convertedAmount,
            countryCode: normalizedDeposit.country,
            redirectUrl: callbackUrl,
          });
          return res.json({ deposit, westpayUrl, westpay: true });
        } catch (westpayError: any) {
          console.error("[westpay] deposit error:", westpayError);
          return res.status(400).json({ message: westpayError.message || "WestPay error", westpay: true });
        }
      }

      const deposit = await storage.createDeposit({
        userId: req.session.userId!,
         amount: normalizedDeposit.amount,
         accountName: normalizedDeposit.accountName,
         accountNumber: normalizedDeposit.accountNumber,
         country: normalizedDeposit.country,
         paymentMethod: normalizedDeposit.paymentMethod,
         paymentChannelId: normalizedDeposit.paymentChannelId && normalizedDeposit.paymentChannelId > 0 ? normalizedDeposit.paymentChannelId : null,
        paymentNumberId: paymentNumberId || null,
        channelName: channelName || null,
        screenshot: screenshot || null,
        paymentMessage: paymentMessage || null,
        reference: reference || null,
        status: "pending",
      });

      res.json({ deposit, soleaspay: false });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Verify payment status (Soleaspay)
  app.get("/api/deposits/:id/verify", requireAuth, async (req, res) => {
    try {
      const depositId = parseInt(getRouteParam(req, "id"));
      const deposit = await storage.getDeposit(depositId);
      
      if (!deposit) {
        return res.status(404).json({ message: "Deposit not found" });
      }

      if (deposit.userId !== req.session.userId) {
        return res.status(403).json({ message: "Acces refuse" });
      }

      if (deposit.status === "approved" || deposit.status === "rejected") {
        return res.json({ status: deposit.status });
      }

      if (deposit.soleaspayReference && deposit.soleaspayOrderId) {
        try {
          const verifyResult = await verifyPayment(deposit.soleaspayOrderId, deposit.soleaspayReference);
          const newStatus = mapSoleaspayStatus(verifyResult.status);

          if (newStatus !== "pending" && newStatus !== deposit.status) {
            await storage.updateDeposit(depositId, { 
              status: newStatus,
              processedAt: new Date()
            });

            if (newStatus === "approved") {
              const user = await storage.getUser(deposit.userId);
              if (user) {
                const newBalance = parseFloat(user.balance) + deposit.amount;
                await storage.updateUser(deposit.userId, {
                  balance: newBalance.toFixed(2),
                  hasDeposited: true,
                });

                await storage.createTransaction({
                  userId: deposit.userId,
                  type: "deposit",
                  amount: deposit.amount.toString(),
                  description: `Depot Soleaspay #${deposit.id}`,
                });

                await storage.processDepositReferralCommissions(deposit.userId, deposit.amount);
              }
            }
          }

          return res.json({ 
            status: newStatus,
            soleaspay: true,
            soleaspayStatus: verifyResult.status,
            message: verifyResult.message
          });
        } catch (verifyError: any) {
          console.error("[soleaspay] Verify error:", verifyError);
          return res.json({ 
            status: deposit.status,
            soleaspay: true,
            error: "Verification error"
          });
        }
      }

      return res.json({ status: deposit.status });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/deposits/history", requireAuth, async (req, res) => {
    try {
      const deposits = await storage.getUserDeposits(req.session.userId!);
      res.json(deposits);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── AshtechPay Direct API ───────────────────────────────────────────────────
  app.get("/api/ashtechpay/countries", requireAuth, async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      if (settings.ashtechEnabled !== "true" || !isAshtechConfigured()) {
        return res.status(503).json({ message: "AshtechPay is not enabled or configured" });
      }
      const activeCodes = new Set((await storage.getActiveCountries()).map((country) => country.code.toUpperCase()));
      const allowlist = (settings.ashtechCountries || "").split(",").map((code) => code.trim().toUpperCase()).filter(Boolean);
      res.json((await ashtechGetCountries()).filter((country) =>
        activeCodes.has(country.code.toUpperCase()) &&
        (allowlist.length === 0 || allowlist.includes(country.code.toUpperCase())),
      ));
    } catch (error: any) {
      console.error("[ashtechpay] countries error:", error);
      res.status(502).json({ message: error.message || "Unable to load AshtechPay countries" });
    }
  });

  app.post("/api/ashtechpay/collect", requireAuth, async (req, res) => {
    try {
      const { amount, country, operator, phone, otp, depositId, reference: requestedReference } = req.body;
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const settings = await storage.getSettings();
      if (settings.ashtechEnabled !== "true") {
        return res.status(400).json({ message: "AshtechPay is not enabled" });
      }
      const numericAmount = Number(amount);
       const minDeposit = Number(settings.minDeposit);
       const depositConversionRate = Number(settings.depositConversionRate);
       if (!Number.isFinite(minDeposit) || minDeposit < 0 ||
           !Number.isFinite(depositConversionRate) || depositConversionRate <= 0) {
         return res.status(500).json({ message: "Les réglages de dépôt sont incomplets ou invalides" });
       }
      if (!Number.isFinite(numericAmount) || numericAmount < minDeposit) {
        return res.status(400).json({ message: `Minimum amount: ${minDeposit.toLocaleString()} GPB` });
      }
      if (!Number.isFinite(depositConversionRate) || depositConversionRate <= 0) {
        return res.status(500).json({ message: "Le taux de conversion du dépôt est invalide" });
      }
      const convertedAmount = Math.round(numericAmount * depositConversionRate);
      if (!country || !operator || !phone) {
        return res.status(400).json({ message: "Country, operator, and number are required" });
      }
      const activeCountry = await getActiveCountry(country);
      if (!activeCountry || activeCountry.code !== user.country || !await isActiveCountryOperator(country, operator)) {
        return res.status(400).json({ message: "Country or operator unavailable" });
      }
      const ashtechAllowlist = (settings.ashtechCountries || "").split(",").map((code) => code.trim().toUpperCase()).filter(Boolean);
      if (ashtechAllowlist.length > 0 && !ashtechAllowlist.includes(activeCountry.code)) {
        return res.status(400).json({ message: "AshtechPay is not enabled for this country" });
      }

      const existingDeposit = depositId ? await storage.getDeposit(Number(depositId)) : undefined;
      if (existingDeposit && existingDeposit.userId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const generatedReference = `paget-studio-${Date.now()}-${user.id}`;
      const requestedAshtechReference = typeof requestedReference === "string"
        ? requestedReference.trim()
        : "";
      const reference = existingDeposit?.ashtechReference?.startsWith("paget-studio-")
        ? existingDeposit.ashtechReference
        : requestedAshtechReference.startsWith("paget-studio-")
          ? requestedAshtechReference
          : generatedReference;
      const notifyBaseUrl = getPublicAppBaseUrl(req);
      const result = await ashtechCollect({
        amount: convertedAmount,
        currency: activeCountry.currency,
        phone: String(phone).trim(),
        operator: String(operator).trim(),
        countryCode: String(country).trim().toUpperCase(),
        reference,
        notifyUrl: `${notifyBaseUrl}/api/webhooks/ashtechpay`,
        ...(otp ? { otp: String(otp).trim() } : {}),
      });

      const mappedStatus = mapAshtechStatus(result.status);
      const deposit = existingDeposit
        ? await storage.updateDeposit(existingDeposit.id, {
            // Keep successful responses claimable by the idempotent approval
            // gate below before crediting the wallet.
            status: mappedStatus === "approved" ? "processing" : mappedStatus,
            ashtechTransactionId: result.transaction_id || existingDeposit.ashtechTransactionId,
            ashtechReference: reference,
          })
        : await storage.createDeposit({
            userId: user.id,
            amount: numericAmount,
            accountName: user.fullName,
            accountNumber: String(phone).trim(),
            country: String(country).trim().toUpperCase(),
            paymentMethod: String(operator).trim(),
            status: mappedStatus === "approved" ? "processing" : mappedStatus,
            ashtechTransactionId: result.transaction_id,
            ashtechReference: reference,
          });

      if (mappedStatus === "approved") {
        const claimedDeposit = await storage.claimDepositApproval(deposit.id);
        if (claimedDeposit) await creditApprovedDeposit(claimedDeposit);
      }

      res.status(202).json({
        depositId: deposit.id,
        transactionId: result.transaction_id,
        reference,
        status: mappedStatus,
        requiresOtp: Boolean(result.ussd_code || result.message?.toLowerCase().includes("otp")),
        ussdCode: result.ussd_code || null,
        waveUrl: result.wave_url || null,
        message: result.message || null,
      });
    } catch (error: any) {
      if (error instanceof AshtechApiError && error.status === 400 && error.data?.error === "otp_required") {
        const {
          amount: requestedAmount,
          country: requestCountry,
          operator: requestOperator,
          phone: requestPhone,
          depositId: requestDepositId,
        } = req.body;
        const otpUser = await storage.getUser(req.session.userId!);
        if (!otpUser) return res.status(401).json({ message: "Not authenticated" });
        const otpAmount = Number(requestedAmount);
        const otpExistingDeposit = requestDepositId
          ? await storage.getDeposit(Number(requestDepositId))
          : undefined;
        const otpReference = String(error.data.reference || "").trim();
        if (!otpReference) {
          return res.status(400).json({ message: error.message || "Missing AshtechPay OTP reference" });
        }

        const otpUssdCode = error.data.ussd_code
          || (requestCountry === "BF" && /orange/i.test(String(requestOperator)) ? `*144*4*6*${otpAmount}#` : null)
          || (requestCountry === "CI" && /orange/i.test(String(requestOperator)) ? "#144*82#" : null);
        const otpDeposit = otpExistingDeposit
          ? await storage.updateDeposit(otpExistingDeposit.id, { status: "pending", ashtechReference: otpReference })
          : await storage.createDeposit({
              userId: otpUser.id,
              amount: otpAmount,
              accountName: otpUser.fullName,
              accountNumber: String(requestPhone).trim(),
              country: String(requestCountry).trim().toUpperCase(),
              paymentMethod: String(requestOperator).trim(),
              status: "pending",
              ashtechReference: otpReference,
            });

        return res.status(400).json({
          error: "otp_required",
          message: error.message,
          depositId: otpDeposit.id,
          reference: otpReference,
          requiresOtp: true,
          ussdCode: otpUssdCode,
        });
      }
      const message = error.message || "AshtechPay error";
      const errorUser = await storage.getUser(req.session.userId!);
      void sendTelegramMessage(
        [
          "❌ <b>Deposit error</b>",
          `User: ${formatTelegramValue(errorUser?.fullName || "Unknown")}`,
          `Amount: <b>${formatTelegramValue(req.body?.amount)} GPB</b>`,
          `Country: ${formatTelegramValue(req.body?.country)}`,
          `Operator: ${formatTelegramValue(req.body?.operator)}`,
          `Exact error: <code>${formatTelegramValue(message)}</code>`,
        ].join("\n"),
      ).catch((notificationError) => console.error("[telegram] deposit error notification failed:", notificationError.message));
      console.error("[ashtechpay] collect error:", message);
      res.status(400).json({ message });
    }
  });

  app.get("/api/deposits/:id/ashtechpay-status", requireAuth, async (req, res) => {
    try {
      const deposit = await storage.getDeposit(parseInt(getRouteParam(req, "id")));
      if (!deposit) return res.status(404).json({ message: "Deposit not found" });
      if (deposit.userId !== req.session.userId) return res.status(403).json({ message: "Access denied" });
      if (deposit.status === "approved" || deposit.status === "rejected") {
        return res.json({ status: deposit.status });
      }
      if (!deposit.ashtechTransactionId) return res.json({ status: deposit.status });

      const result = await ashtechGetTransaction(deposit.ashtechTransactionId);
      const newStatus = mapAshtechStatus(result.status);
      if (newStatus !== "pending" && newStatus !== deposit.status) {
        if (newStatus === "approved") {
          // The conditional update is the idempotency gate: only the request
          // that claims the pending deposit is allowed to credit the wallet.
          const claimedDeposit = await storage.claimDepositApproval(deposit.id);
          if (claimedDeposit) {
            const user = await storage.getUser(deposit.userId);
            if (user) {
              await storage.updateUser(user.id, {
                balance: (parseFloat(user.balance) + deposit.amount).toFixed(2),
                hasDeposited: true,
              });
              await storage.createTransaction({
                userId: user.id,
                type: "deposit",
                amount: deposit.amount.toString(),
                description: `AshtechPay deposit #${deposit.id}`,
              });
              await storage.processDepositReferralCommissions(user.id, deposit.amount);
            }
          }
        } else {
          await storage.updateDeposit(deposit.id, { status: newStatus, processedAt: new Date() });
        }
      }
      const finalDeposit = await storage.getDeposit(deposit.id);
      res.json({ status: finalDeposit?.status || newStatus, rawStatus: result.status });
    } catch (error: any) {
      console.error("[ashtechpay] status error:", error);
      res.status(502).json({ message: error.message || "AshtechPay verification error" });
    }
  });

  // ── SendavaPay routes ──────────────────────────────────────────────────────

  // Proxy: operators for a given country (public SendavaPay endpoint)
  app.get("/api/sendavapay/operators/:country", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      if (settings.sendavapayEnabled !== "true") {
        return res.status(503).json({ success: false, message: "SendavaPay is not enabled" });
      }
      const requestedCountry = getRouteParam(req, "country").toUpperCase();
      if (!await getActiveCountry(requestedCountry)) {
        return res.status(404).json({ success: false, message: "Country unavailable" });
      }
      const svCountry = toSendavapayCountry(requestedCountry);
      const r = await fetch(
        `https://sendavapay.com/api/sdk/v1/operators/${svCountry}`
      );
      const data = await r.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Create payment (server-side, stores deposit record)
  app.post("/api/sendavapay/create", requireAuth, async (req, res) => {
    try {
      const { amount, country, operatorId, operatorName, payerPhone } = req.body;
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const settings = await storage.getSettings();
      if (settings.sendavapayEnabled !== "true") {
        return res.status(400).json({ message: "SendavaPay is not enabled" });
      }
      const minDeposit = Number(settings.minDeposit);
      const depositConversionRate = Number(settings.depositConversionRate);
      if (!Number.isFinite(minDeposit) || minDeposit < 0 ||
          !Number.isFinite(depositConversionRate) || depositConversionRate <= 0) {
        return res.status(500).json({ message: "Les réglages de dépôt sont incomplets ou invalides" });
      }
      if (!amount || amount < minDeposit) {
        return res.status(400).json({ message: `Minimum amount: ${minDeposit.toLocaleString()} GPB` });
      }
      if (!Number.isFinite(depositConversionRate) || depositConversionRate <= 0) {
        return res.status(500).json({ message: "Le taux de conversion du dépôt est invalide" });
      }
      const convertedAmount = Math.round(Number(amount) * depositConversionRate);
      if (!payerPhone || !payerPhone.trim()) {
        return res.status(400).json({ message: "Mobile Money number is required" });
      }
      const activeCountry = await getActiveCountry(country);
      if (!activeCountry || activeCountry.code !== user.country || !await isActiveCountryOperator(country, operatorName)) {
        return res.status(400).json({ message: "Country or operator unavailable" });
      }

      const svCountry = toSendavapayCountry(country);
      const currency = sendavapayGetCurrency(country);
      const externalRef = `DEP-${Date.now()}-${user.id}`;
      // Only use the number explicitly entered for this deposit; never reuse the profile phone.
      const customerPhone = sendavapayFormatPhone(payerPhone.trim(), country);
      const baseUrl = getPublicAppBaseUrl(req);
      const webhookUrl = `${baseUrl}/api/webhooks/sendavapay`;

      const result = await sendavapayCreate({
         amount: convertedAmount,
        currency,
        description: `Deposit #${externalRef}`,
        customerName: user.fullName,
        customerPhone,
        customerEmail: `user${user.id}@${new URL(baseUrl).hostname}`,
        payerCountry: svCountry,
        webhookUrl,
        externalReference: externalRef,
      });

      if (!result.success || !result.data) {
        return res.status(400).json({
          message: result.error || "SendavaPay error",
        });
      }

      const deposit = await storage.createDeposit({
        userId: user.id,
        amount,
        accountName: user.fullName,
        accountNumber: customerPhone,
        country,
        paymentMethod: operatorName || "SendavaPay",
        status: "processing",
        sendavapayReference: result.data.reference,
        sendavapayToken: result.data.paymentToken,
      });

      res.json({
        depositId: deposit.id,
        paymentToken: result.data.paymentToken,
        reference: result.data.reference,
        expiresAt: result.data.expiresAt,
      });
    } catch (error: any) {
      console.error("[sendavapay] create error:", error);
      res.status(500).json({ message: error.message || "Server error" });
    }
  });

  // Initiate payment (proxy, calls CORS endpoint on behalf of authenticated user)
  app.post("/api/sendavapay/initiate", requireAuth, async (req, res) => {
    try {
      const { paymentToken, payerCountry, operatorId, depositId, payerPhone } = req.body;
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      if (!payerPhone || !payerPhone.trim()) {
        return res.status(400).json({ message: "Mobile Money number is required" });
      }
      const deposit = depositId ? await storage.getDeposit(Number(depositId)) : undefined;
      if (!deposit || deposit.userId !== user.id || !await getActiveCountry(payerCountry) || deposit.country !== String(payerCountry).toUpperCase()) {
        return res.status(400).json({ message: "Payment or country unavailable" });
      }

      const svCountry = toSendavapayCountry(payerCountry);
      const customerPhone = sendavapayFormatPhone(payerPhone.trim(), payerCountry);

      const result = await sendavapayInitiate({
        paymentToken,
        payerName: user.fullName,
        payerPhone: customerPhone,
        payerCountry: svCountry,
        operatorId,
      });

      // Update deposit status to processing
      if (depositId) {
        await storage.updateDeposit(depositId, { status: "processing" });
      }

      res.json(result);
    } catch (error: any) {
      console.error("[sendavapay] initiate error:", error);
      res.status(500).json({ message: error.message || "Server error" });
    }
  });

  // Submit OTP — CLIENT (CORS) endpoint, no SDK key
  app.post("/api/sendavapay/submit-otp", requireAuth, async (req, res) => {
    try {
      const { otpToken, otp } = req.body;
      if (!otpToken || !otp) {
        return res.status(400).json({ message: "otpToken and otp are required" });
      }
      const result = await sendavapaySubmitOtp({ otpToken, otp });
      res.json(result);
    } catch (error: any) {
      console.error("[sendavapay] submit-otp error:", error);
      res.status(500).json({ message: error.message || "Server error" });
    }
  });

  // Retry a failed payment — CLIENT (CORS) endpoint, no SDK key
  app.post("/api/sendavapay/retry", requireAuth, async (req, res) => {
    try {
      const { paymentToken, depositId } = req.body;
      if (!paymentToken) {
        return res.status(400).json({ message: "paymentToken is required" });
      }
      const deposit = depositId ? await storage.getDeposit(Number(depositId)) : undefined;
      if (!deposit || deposit.userId !== req.session.userId || deposit.sendavapayToken !== paymentToken) {
        return res.status(403).json({ message: "Payment unavailable" });
      }
      // Reset deposit status to processing
      if (depositId) {
        await storage.updateDeposit(depositId, { status: "processing" });
      }
      const result = await sendavapayRetry(paymentToken);
      res.json(result);
    } catch (error: any) {
      console.error("[sendavapay] retry error:", error);
      res.status(500).json({ message: error.message || "Server error" });
    }
  });

  // Poll payment status using GET /payment-status/:reference (lighter than verify-payment)
  app.get("/api/deposits/:id/sendavapay-status", requireAuth, async (req, res) => {
    try {
      const depositId = parseInt(getRouteParam(req, "id"));
      const deposit = await storage.getDeposit(depositId);
      if (!deposit) return res.status(404).json({ message: "Deposit not found" });
      if (deposit.userId !== req.session.userId) return res.status(403).json({ message: "Access denied" });

      if (deposit.status === "approved" || deposit.status === "rejected") {
        return res.json({ status: deposit.status });
      }

      if (!deposit.sendavapayReference) {
        return res.json({ status: deposit.status });
      }

      // Use lightweight GET payment-status endpoint for polling
      const statusRes = await fetch(
        `${process.env.SENDAVAPAY_API_BASE || "https://sendavapay.com/api/sdk/v1"}/payment-status/${deposit.sendavapayReference}`,
        { headers: { Authorization: `Bearer ${process.env.SENDAVAPAY_API_KEY || ""}` } }
      );
      const statusData = await statusRes.json() as { success: boolean; data?: { status: string } };

      if (!statusData.success || !statusData.data) {
        return res.json({ status: deposit.status });
      }

      const newStatus = mapSendavapayStatus(statusData.data.status);
      if (newStatus !== "pending" && newStatus !== deposit.status) {
        if (newStatus === "approved") {
          const claimedDeposit = await storage.claimDepositApproval(depositId);
          if (claimedDeposit) await creditApprovedDeposit(claimedDeposit);
        } else {
          await storage.updateDeposit(depositId, { status: newStatus, processedAt: new Date() });
        }
      }

      res.json({ status: newStatus || deposit.status, rawStatus: statusData.data.status });
    } catch (error: any) {
      console.error("[sendavapay] status check error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Webhook (HMAC verified)
  // AshtechPay does not document a webhook signature. This endpoint therefore
  // never trusts the posted event/status: it only uses it to locate the
  // deposit, then verifies the transaction through the authenticated API.
  app.post("/api/webhooks/ashtechpay", async (req, res) => {
    try {
      if (!isAshtechConfigured()) {
        return res.status(503).json({ message: "AshtechPay is not configured" });
      }
      const payload = req.body || {};
      const reference = String(payload.reference || payload.data?.reference || "").trim();
      const transactionId = String(
        payload.transaction_id || payload.transactionId || payload.data?.transaction_id || payload.data?.transactionId || "",
      ).trim();
      let deposit = transactionId
        ? await storage.getDepositByAshtechTransactionId(transactionId)
        : undefined;
      if (!deposit && reference) {
        deposit = await storage.getDepositByAshtechReference(reference);
      }
      if (!deposit) return res.status(202).json({ received: true });
      if (deposit.status === "approved" || deposit.status === "rejected") {
        return res.json({ received: true, status: deposit.status });
      }
      if (!deposit.ashtechTransactionId) return res.status(202).json({ received: true });

      const verified = await ashtechGetTransaction(deposit.ashtechTransactionId);
      const verifiedStatus = mapAshtechStatus(verified.status);
      if (verifiedStatus === "approved") {
        const claimedDeposit = await storage.claimDepositApproval(deposit.id);
        if (claimedDeposit) await creditApprovedDeposit(claimedDeposit);
      } else if (verifiedStatus === "rejected") {
        await storage.updateDeposit(deposit.id, { status: "rejected", processedAt: new Date() });
      }
      res.json({ received: true, status: verifiedStatus });
    } catch (error: any) {
      console.error("[ashtechpay webhook] verification error:", error);
      res.status(502).json({ message: "AshtechPay verification unavailable" });
    }
  });

  app.post(
    "/api/webhooks/sendavapay",
    async (req, res) => {
      try {
        const settings = await storage.getSettings();
        // Prefer the deployment secret; keep the admin setting as a
        // backwards-compatible fallback for existing installations.
        const secret = process.env.SENDAVAPAY_WEBHOOK_SECRET || settings.sendavapayWebhookSecret || "";
        if (!secret) {
          console.error("[sendavapay webhook] Webhook secret not configured");
          return res.status(503).json({ message: "Webhook secret is not configured" });
        }
        const sig = req.headers["x-sendavapay-signature"] as string || "";
        // req.rawBody is captured by the global express.json verify callback
        const rawBuf = (req as any).rawBody as Buffer | undefined;
        if (secret && rawBuf && !sendavapayVerifySignature(rawBuf, sig, secret)) {
          console.warn("[sendavapay webhook] Invalid signature");
          return res.status(401).json({ message: "Invalid signature" });
        }

        const payload = req.body;
        const { event, reference, status } = payload;

        if (!reference) return res.json({ received: true });

        // Find deposit by sendavapay reference
        const deposit = await storage.getDepositBySendavapayReference(reference);
        if (!deposit) {
          console.warn(`[sendavapay webhook] No deposit found for reference ${reference}`);
          return res.json({ received: true });
        }

        if (deposit.status === "approved" || deposit.status === "rejected") {
          return res.json({ received: true }); // already processed
        }

        if (event === "payment.completed" || status === "completed") {
          const claimedDeposit = await storage.claimDepositApproval(deposit.id);
          if (claimedDeposit) await creditApprovedDeposit(claimedDeposit);
        } else if (event === "payment.failed" || event === "payment.expired" || status === "failed" || status === "cancelled") {
          await storage.updateDeposit(deposit.id, { status: "rejected", processedAt: new Date() });
        }

        res.json({ received: true });
      } catch (error: any) {
        console.error("[sendavapay webhook] error:", error);
        res.status(500).json({ message: error.message });
      }
    }
  );

  // ── WestPay: payment callback (redirect after user pays on WestPay page) ────
  app.get("/api/westpay/callback", requireAuth, async (req, res) => {
    try {
      const { depositId, status, ref } = req.query as Record<string, string>;
      const baseUrl = getPublicAppBaseUrl(req);
      if (!depositId) return res.redirect(`${baseUrl}/deposit?wp_status=error`);
      const deposit = await storage.getDeposit(parseInt(depositId));
      if (!deposit) return res.redirect(`${baseUrl}/deposit?wp_status=error`);
      if (deposit.userId !== req.session.userId) {
        return res.redirect(`${baseUrl}/deposit?wp_status=error`);
      }
      // Persist the WestPay transaction reference; webhook will approve
      if (ref && !deposit.westpayReference && (deposit.status === "pending" || deposit.status === "processing")) {
        await storage.updateDeposit(deposit.id, { westpayReference: ref });
      }
      const wpStatus = status === "success" ? "success" : "pending";
      res.redirect(`${baseUrl}/deposit?wp_status=${wpStatus}&wp_depositId=${depositId}`);
    } catch (err: any) {
      console.error("[westpay callback] error:", err);
      const baseUrl = getPublicAppBaseUrl(req);
      res.redirect(`${baseUrl}/deposit?wp_status=error`);
    }
  });

  // ── WestPay webhook (HMAC-SHA256 via X-RobotPay-Signature) ──────────────────
  app.post(
    "/api/webhooks/westpay",
    async (req, res) => {
      try {
        const settings = await storage.getSettings();
        const secret = process.env.WESTPAY_WEBHOOK_SECRET || settings.westpayWebhookSecret || "";
        if (!secret) {
          console.error("[westpay webhook] Webhook secret not configured");
          return res.status(503).json({ message: "Webhook secret is not configured" });
        }
        const sig = (req.headers["x-robotpay-signature"] as string) || "";
        // req.rawBody is captured by the global express.json verify callback.
        // Never process a webhook when the raw payload was not captured:
        // parsing alone is not sufficient to authenticate the notification.
        const rawBuf = (req as any).rawBody as Buffer | undefined;
        if (!rawBuf || !westpayVerifySignature(rawBuf, sig, secret)) {
          console.warn("[westpay webhook] Signature invalide");
          return res.status(401).json({ message: "Signature invalide" });
        }
        const payload = req.body;
        const { event, txId, status } = payload;
        if (!txId) return res.json({ received: true });
        const deposit = await storage.getDepositByWestpayReference(txId);
        if (!deposit) {
          console.warn(`[westpay webhook] No deposit found for txId: ${txId}`);
          return res.json({ received: true });
        }
        if (deposit.status === "approved" || deposit.status === "rejected") {
          return res.json({ received: true });
        }
        if (event === "payment.confirmed" || status === "confirmed") {
          const claimedDeposit = await storage.claimDepositApproval(deposit.id);
          if (claimedDeposit) await creditApprovedDeposit(claimedDeposit);
        } else if (
          event === "payment.failed" ||
          event === "payment.expired" ||
          status === "failed" ||
          status === "expired" ||
          status === "cancelled"
        ) {
          await storage.updateDeposit(deposit.id, { status: "rejected", processedAt: new Date() });
        }
        res.json({ received: true });
      } catch (err: any) {
        console.error("[westpay webhook] error:", err);
        res.status(500).json({ message: err.message });
      }
    }
  );

  // Withdrawals
  app.post("/api/withdrawals", requireAuth, async (req, res) => {
    try {
      const { amount, walletId } = req.body;
      const user = await storage.getUser(req.session.userId!);
      
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const identityVerification = await storage.getIdentityVerification(user.id);
      if (identityVerification?.status !== "approved") {
        return res.status(403).json({
          message: "Vous devez faire approuver votre identité avant d'effectuer un retrait",
        });
      }

      const requestedAmount = Number(amount);
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }
      const settingsForWithdrawal = await storage.getSettings();
      const minWithdrawal = Number(settingsForWithdrawal.minWithdrawal);
      if (!Number.isFinite(minWithdrawal) || minWithdrawal < 0) {
        return res.status(500).json({ message: "Le minimum de retrait est invalide" });
      }
      if (requestedAmount < minWithdrawal) {
        return res.status(400).json({ message: `Minimum amount: ${minWithdrawal} GPB` });
      }

      if (!user.hasActiveProduct) {
        return res.status(400).json({ message: "Buy a product first" });
      }

      if (user.isWithdrawalBlocked) {
        return res.status(400).json({ message: "Withdrawals are blocked on this account" });
      }

      if (user.mustInviteToWithdraw) {
        const stats = await storage.getTeamStats(user.id);
        if (stats.level1Invested < 1) {
          return res.status(400).json({ message: "Invite someone who invests" });
        }
      }

      const balance = parseFloat(user.balance);
      if (requestedAmount > balance) {
        return res.status(400).json({ message: "Solde insuffisant" });
      }

      const selectedWalletId = Number(walletId);
      const wallet = Number.isInteger(selectedWalletId)
        ? (await storage.getWallets(user.id)).find((item) => item.id === selectedWalletId)
        : undefined;
      if (!wallet) {
        return res.status(400).json({ message: "Select a valid withdrawal wallet" });
      }
      if (wallet.country !== user.country || !await isActiveCountryOperator(wallet.country, wallet.paymentMethod)) {
        return res.status(400).json({ message: "Select a wallet with an active operator in your country" });
      }

      const todayCount = await storage.getUserWithdrawalCountToday(user.id);
      const settingsForMax = await storage.getSettings();
      const maxPerDay = Number(settingsForMax.maxWithdrawalsPerDay);
      if (!Number.isInteger(maxPerDay) || maxPerDay < 1) {
        return res.status(500).json({ message: "La limite quotidienne de retraits est invalide" });
      }
      if (todayCount >= maxPerDay) {
        return res.status(400).json({ message: `Maximum ${maxPerDay} withdrawal${maxPerDay > 1 ? 's' : ''} per day` });
      }

      const settings = await storage.getSettings();
      const fees = Number(settings.withdrawalFees);
      if (!Number.isFinite(fees) || fees < 0 || fees > 100) {
        return res.status(500).json({ message: "Les frais de retrait sont invalides" });
      }
      const feeAmount = Math.round(requestedAmount * fees / 100);
      const netAmount = requestedAmount - feeAmount;

       const withdrawal = await storage.createWithdrawalWithDebit({
        userId: user.id,
        amount: requestedAmount,
        netAmount,
        fees: feeAmount,
        accountName: wallet.accountName,
        accountNumber: wallet.accountNumber,
        country: wallet.country,
        paymentMethod: wallet.paymentMethod,
        status: "pending",
      });

      void sendTelegramMessage(
        [
          "💸 <b>Withdrawal initiated</b>",
          `User: ${formatTelegramValue(user.fullName)}`,
          `Amount: <b>${formatTelegramValue(requestedAmount)} GPB</b>`,
          `Net after fees: ${formatTelegramValue(netAmount)} GPB`,
          `Method: ${formatTelegramValue(wallet.paymentMethod)}`,
          `Country: ${formatTelegramValue(wallet.country)}`,
          `Withdrawal ID: ${formatTelegramValue(withdrawal.id)}`,
        ].join("\n"),
      ).catch((error) => console.error("[telegram] withdrawal notification failed:", error.message));

      res.json(withdrawal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/withdrawals/history", requireAuth, async (req, res) => {
    try {
      const withdrawals = await storage.getUserWithdrawals(req.session.userId!);
      res.json(withdrawals);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Wallets
  app.get("/api/wallets", requireAuth, async (req, res) => {
    try {
      const wallets = await storage.getWallets(req.session.userId!);
      res.json(wallets);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/wallets/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteWallet(req.session.userId!, parseInt(getRouteParam(req, "id")));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/wallets/:id/default", requireAuth, async (req, res) => {
    try {
      await storage.setDefaultWallet(req.session.userId!, parseInt(getRouteParam(req, "id")));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Team
  app.get("/api/team/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getTeamStats(req.session.userId!);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/team/details", requireAuth, async (req, res) => {
    try {
      const team = await storage.getDetailedTeam(req.session.userId!);
      res.json(team);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Tasks
  app.get("/api/tasks", requireAuth, async (req, res) => {
    try {
      const tasks = await storage.getTasksWithStatus(req.session.userId!);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tasks/:id/claim", requireAuth, async (req, res) => {
    try {
      await storage.claimTask(req.session.userId!, parseInt(getRouteParam(req, "id")));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Admin mission center configuration
  app.get("/api/admin/tasks", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getAllTasks());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/tasks/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(getRouteParam(req, "id"));
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Mission invalide" });
      }

      const body = req.body ?? {};
      const data: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (name.length < 2 || name.length > 120) {
          return res.status(400).json({ message: "Le nom doit contenir entre 2 et 120 caractères" });
        }
        data.name = name;
      }
      if (body.description !== undefined) {
        const description = String(body.description).trim();
        if (description.length < 2 || description.length > 500) {
          return res.status(400).json({ message: "La description doit contenir entre 2 et 500 caractères" });
        }
        data.description = description;
      }
      for (const field of ["requiredInvites", "reward", "sortOrder"] as const) {
        if (body[field] !== undefined) {
          const value = Number(body[field]);
          const minimum = field === "sortOrder" ? 0 : 1;
          if (!Number.isInteger(value) || value < minimum) {
            return res.status(400).json({ message: `${field} doit être un nombre entier valide` });
          }
          data[field] = value;
        }
      }
      if (body.conditionType !== undefined) {
        if (!TASK_CONDITION_TYPES.includes(body.conditionType as TaskConditionType)) {
          return res.status(400).json({ message: "Condition de mission invalide" });
        }
        data.conditionType = body.conditionType;
      }
      if (body.isActive !== undefined) {
        if (typeof body.isActive !== "boolean") {
          return res.status(400).json({ message: "isActive doit être booléen" });
        }
        data.isActive = body.isActive;
      }
      if (Object.keys(data).length === 0) {
        return res.status(400).json({ message: "Aucune modification fournie" });
      }

      const task = await storage.updateTask(id, data);
      if (!task) {
        return res.status(404).json({ message: "Mission introuvable" });
      }
      await storage.logAdminAction(req.session.userId!, "update_task", null, `Task ${task.id} updated`);
      res.json(task);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // News and announcements
  app.get("/api/news", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getPublishedNews(req.session.userId!));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/news/:id/view", requireAuth, async (req, res) => {
    try {
      const result = await storage.addNewsView(parseInt(getRouteParam(req, "id")), req.session.userId!);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/news/:id/like", requireAuth, async (req, res) => {
    try {
      const result = await storage.toggleNewsLike(parseInt(getRouteParam(req, "id")), req.session.userId!);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Customer service chat
  app.get("/api/support/conversation", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getSupportConversationStatus(req.session.userId!));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/support/withdrawal-request/status", requireAuth, async (req, res) => {
    try {
      const [latestWithdrawal] = await storage.getUserWithdrawals(req.session.userId!);
      res.json({
        hasRequest: Boolean(
          latestWithdrawal?.status === "pending" &&
          await storage.hasWithdrawalRequest(req.session.userId!),
        ),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/support/messages", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getSupportMessages(req.session.userId!));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/support/conversation/reopen", requireAuth, async (req, res) => {
    res.status(403).json({
      message: "Une nouvelle conversation doit être ouverte depuis la page de retrait.",
    });
  });

  app.post("/api/support/messages", requireAuth, async (req, res) => {
    try {
      if (!await storage.hasWithdrawalRequest(req.session.userId!)) {
        return res.status(403).json({ message: "Envoyez d'abord une demande de retrait." });
      }
      const status = await storage.getSupportConversationStatus(req.session.userId!);
      if (status.isClosed) {
        return res.status(423).json({ message: "Cette conversation est fermée. L'envoi de messages est indisponible." });
      }
      const payload = parseSupportMessageBody(req.body);
      const message = await storage.createSupportMessage({
        userId: req.session.userId!,
        senderRole: "user",
        ...payload,
      });
      res.status(201).json(message);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/support/withdrawal-request", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const identityVerification = await storage.getIdentityVerification(user.id);
      if (identityVerification?.status !== "approved") {
        return res.status(403).json({
          message: "Vous devez faire approuver votre identité avant d'effectuer un retrait",
        });
      }

      const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
      const phoneResult = phoneNumberSchema.safeParse(phone);
      if (!phoneResult.success || !phone.startsWith("+")) {
        return res.status(400).json({ message: "Saisissez un numéro de retrait avec son indicatif, par exemple +226059546345" });
      }

      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "Saisissez un montant de retrait valide" });
      }

      const settings = await storage.getSettings();
       const minWithdrawal = Number(settings.minWithdrawal);
       const withdrawalConversionRate = Number(settings.withdrawalConversionRate);
       const feePercent = Number(settings.withdrawalFees);
       if (!Number.isFinite(minWithdrawal) || minWithdrawal < 0) {
        return res.status(500).json({ message: "Le minimum de retrait est invalide" });
      }
       if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) {
         return res.status(500).json({ message: "Les frais de retrait sont invalides" });
       }
      if (amount < minWithdrawal) {
        return res.status(400).json({ message: `Le minimum de retrait est de ${minWithdrawal.toLocaleString("fr-FR")} GPB` });
      }
      if (!Number.isFinite(withdrawalConversionRate) || withdrawalConversionRate <= 0) {
        return res.status(500).json({ message: "Le taux de conversion du retrait est invalide" });
      }
       if (user.isWithdrawalBlocked) {
         return res.status(400).json({ message: "Les retraits sont bloqués sur ce compte" });
       }
       if (!user.hasActiveProduct) {
         return res.status(400).json({ message: "Achetez d'abord un produit" });
       }
       if (user.mustInviteToWithdraw) {
         const stats = await storage.getTeamStats(user.id);
         if (stats.level1Invested < 1) {
           return res.status(400).json({ message: "Invitez une personne qui investit avant de retirer" });
         }
       }
       const supportStatus = await storage.getSupportConversationStatus(user.id);
       if (!supportStatus.isClosed && await storage.hasWithdrawalRequest(user.id)) {
         return res.status(400).json({ message: "Une demande de retrait existe déjà pour ce compte" });
       }
       const maxWithdrawalsPerDay = Number(settings.maxWithdrawalsPerDay);
       if (!Number.isInteger(maxWithdrawalsPerDay) || maxWithdrawalsPerDay < 1) {
         return res.status(500).json({ message: "La limite quotidienne de retraits est invalide" });
       }
       if (await storage.getUserWithdrawalCountToday(user.id) >= maxWithdrawalsPerDay) {
         return res.status(400).json({ message: `Maximum ${maxWithdrawalsPerDay} retrait${maxWithdrawalsPerDay > 1 ? "s" : ""} par jour` });
       }

      const convertedAmount = Math.round(amount * withdrawalConversionRate);
       const feeAmount = Math.round(convertedAmount * feePercent / 100);
      const netAmount = convertedAmount - feeAmount;
      const formattedAmount = amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
      const formattedConvertedAmount = convertedAmount.toLocaleString("fr-FR");
      const formattedFeeAmount = feeAmount.toLocaleString("fr-FR");
      const formattedNetAmount = netAmount.toLocaleString("fr-FR");

       const { requestMessage, automaticReply, withdrawal } = await storage.createWithdrawalSupportRequest({
        userId: user.id,
        amount,
         feeAmount: Math.round(amount * feePercent / 100),
         accountNumber: phone,
        requestMessage: [
          "Bonjour je souhaite effectuer un retrait",
          `de ${formattedAmount} GPB dont la valeur réelle à recevoir est de ${formattedNetAmount} F XOF après conversion et déduction des frais de transaction.`,
          `Numéro de retrait : ${phone}`,
          `Montant converti : ${formattedConvertedAmount} F XOF`,
           `Frais : ${feePercent}% (${formattedFeeAmount} F XOF)`,
          `Net à recevoir : ${formattedNetAmount} F XOF`,
          "Merci de bien vouloir accepter ma demande. Merci.",
        ].join("\n"),
        automaticReply: "Merci, nous avons reçu votre demande. Veuillez patienter, votre marchand va vous prendre en charge dans un bref délai.",
      });

      res.status(201).json({
        requestMessage,
        automaticReply,
         withdrawal,
        conversionRate: withdrawalConversionRate,
         feePercent,
        convertedAmount,
        feeAmount,
        netAmount,
        withdrawalConversionRate,
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/news", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getAllNewsPosts());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/news", requireAdmin, async (req, res) => {
    try {
      const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
      const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
      const imageUrl = typeof req.body.imageUrl === "string" && req.body.imageUrl.trim()
        ? req.body.imageUrl.trim()
        : null;
      const likesCount = parseNewsCount(req.body.likesCount, "Le nombre de j'aime", 0);
      const viewsCount = parseNewsCount(req.body.viewsCount, "Le nombre de vues", 0);

      if (!content) {
        return res.status(400).json({ message: "Le contenu de l'annonce est obligatoire" });
      }
      if (countNewsWords(content) < MIN_NEWS_WORDS) {
        return res.status(400).json({ message: `Le contenu doit comporter au moins ${MIN_NEWS_WORDS} mots` });
      }
      if (title.length > 120) {
        return res.status(400).json({ message: "Le titre ne doit pas dépasser 120 caractères" });
      }
      if (content.length > 20000) {
        return res.status(400).json({ message: "Le contenu ne doit pas dépasser 20 000 caractères" });
      }
      if (imageUrl && (
        !isValidNewsImage(imageUrl) ||
        (imageUrl.startsWith("data:") && imageUrl.length > 4500000) ||
        (imageUrl.startsWith("https://") && imageUrl.length > 2048)
      )) {
        return res.status(400).json({ message: "L'image doit être au format JPG, PNG ou WebP et ne pas dépasser 3 Mo" });
      }

      const post = await storage.createNewsPost({
        title,
        content,
        imageUrl,
        createdBy: req.session.userId!,
        isPublished: true,
        likesCount,
        viewsCount,
      });
      res.status(201).json(post);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/admin/news/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(getRouteParam(req, "id"), 10);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ message: "Identifiant d'annonce invalide" });
      }

      const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
      const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
      const imageUrl = typeof req.body.imageUrl === "string" && req.body.imageUrl.trim()
        ? req.body.imageUrl.trim()
        : null;
      const isPublished = req.body.isPublished;
      const likesCount = parseNewsCount(req.body.likesCount, "Le nombre de j'aime");
      const viewsCount = parseNewsCount(req.body.viewsCount, "Le nombre de vues");

      if (!content) {
        return res.status(400).json({ message: "Le contenu de l'annonce est obligatoire" });
      }
      if (countNewsWords(content) < MIN_NEWS_WORDS) {
        return res.status(400).json({ message: `Le contenu doit comporter au moins ${MIN_NEWS_WORDS} mots` });
      }
      if (title.length > 120) {
        return res.status(400).json({ message: "Le titre ne doit pas dépasser 120 caractères" });
      }
      if (content.length > 20000) {
        return res.status(400).json({ message: "Le contenu ne doit pas dépasser 20 000 caractères" });
      }
      if (imageUrl && (
        !isValidNewsImage(imageUrl) ||
        (imageUrl.startsWith("data:") && imageUrl.length > 4500000) ||
        (imageUrl.startsWith("https://") && imageUrl.length > 2048)
      )) {
        return res.status(400).json({ message: "L'image doit être au format JPG, PNG ou WebP et ne pas dépasser 3 Mo" });
      }
      if (typeof isPublished !== "boolean") {
        return res.status(400).json({ message: "Le statut de publication est invalide" });
      }

      const post = await storage.updateNewsPost(id, {
        title,
        content,
        imageUrl,
        isPublished,
        ...(likesCount === undefined ? {} : { likesCount }),
        ...(viewsCount === undefined ? {} : { viewsCount }),
      });
      if (!post) {
        return res.status(404).json({ message: "Annonce introuvable" });
      }
      res.json(post);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/news/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteNewsPost(parseInt(getRouteParam(req, "id")));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/support/messages", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getAllSupportMessages());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get(
    "/api/admin/support/conversations",
    requireAdmin,
    createAdminSupportConversationsHandler(() => storage.getAllSupportConversations()),
  );

  app.patch("/api/admin/support/conversations/:userId", requireAdmin, async (req, res) => {
    try {
      const userId = Number(getRouteParam(req, "userId"));
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ message: "Utilisateur invalide" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur introuvable" });
      }
      if (typeof req.body?.isClosed !== "boolean") {
        return res.status(400).json({ message: "Le statut du chat est invalide" });
      }
      const conversation = await storage.setSupportConversationClosed(
        userId,
        req.body.isClosed,
        req.session.userId!,
      );
      res.json(conversation);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/support/conversations/:userId/finish-withdrawal", requireAdmin, async (req, res) => {
    try {
      const userId = Number(getRouteParam(req, "userId"));
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ message: "Utilisateur invalide" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur introuvable" });
      }
      const result = await storage.finishWithdrawalConversation({
        userId,
        adminId: req.session.userId!,
        automaticReply: "Votre retrait a été validé et effectué.",
      });
      await storage.logAdminAction(
        req.session.userId!,
        "finish_withdrawal_chat",
        userId,
        `Withdrawal chat finished for user ${userId}`,
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/support/conversations/:userId/read", requireAdmin, async (req, res) => {
    try {
      const userId = Number(getRouteParam(req, "userId"));
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ message: "Utilisateur invalide" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur introuvable" });
      }
      const conversation = await storage.markSupportConversationRead(userId);
      res.json(conversation);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/support/messages", requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.body?.userId);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ message: "Utilisateur invalide" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur introuvable" });
      }
      const status = await storage.getSupportConversationStatus(userId);
      if (status.isClosed) {
        return res.status(423).json({ message: "Ce chat est fermé. Rouvrez-le avant d'envoyer une réponse." });
      }
      const payload = parseSupportMessageBody(req.body);
      const message = await storage.createSupportMessage({
        userId,
        senderRole: "admin",
        ...payload,
      });
      res.status(201).json(message);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch(
    "/api/admin/support/messages/:id",
    requireAdmin,
    createAdminSupportMessageEditHandler((id, message, adminId) => storage.updateSupportMessage(id, message, adminId)),
  );

  app.get("/api/admin/support/messages/:id/history", requireAdmin, async (req, res) => {
    try {
      const messageId = Number(getRouteParam(req, "id"));
      if (!Number.isInteger(messageId) || messageId <= 0) {
        return res.status(400).json({ message: "Message invalide" });
      }
      res.json(await storage.getSupportMessageEditHistory(messageId));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Daily bonus claim (204 GPB every 24h)
  app.post("/api/claim-daily-bonus", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const now = new Date();
      const lastClaim = user.lastDailyBonusClaim ? new Date(user.lastDailyBonusClaim) : null;
      
      if (lastClaim) {
        const hoursSinceClaim = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
        if (hoursSinceClaim < 24) {
          const hoursRemaining = Math.ceil(24 - hoursSinceClaim);
          return res.status(400).json({ 
            message: `You can claim in ${hoursRemaining}h`,
            canClaim: false,
            nextClaimIn: hoursRemaining
          });
        }
      }

      // Add 204 GPB to balance
      const newBalance = parseFloat(user.balance) + 204;
      const newEarningsBalance = parseFloat(user.earningsBalance || "0") + 204;
      await storage.updateUser(user.id, { 
        balance: newBalance.toString(),
        earningsBalance: newEarningsBalance.toString(),
        lastDailyBonusClaim: now
      });

      // Create transaction record
      await storage.createTransaction({
        userId: user.id,
        type: "bonus",
        amount: "204",
        description: "Daily bonus"
      });

      res.json({ success: true, message: "204 GPB bonus added!" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/daily-bonus-status", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const now = new Date();
      const lastClaim = user.lastDailyBonusClaim ? new Date(user.lastDailyBonusClaim) : null;
      
      let canClaim = true;
      let hoursRemaining = 0;

      if (lastClaim) {
        const hoursSinceClaim = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
        if (hoursSinceClaim < 24) {
          canClaim = false;
          hoursRemaining = Math.ceil(24 - hoursSinceClaim);
        }
      }

      const allTransactions = await storage.getUserTransactions(req.session.userId!);
      const bonusTransactions = allTransactions.filter(
        (t: any) => t.type === "bonus" && t.description === "Daily bonus"
      );
      const totalBonusClaimed = bonusTransactions.reduce(
        (sum: number, t: any) => sum + parseFloat(t.amount || "0"), 0
      );
      const daysPointed = bonusTransactions.length;

      res.json({ canClaim, hoursRemaining, totalBonusClaimed, daysPointed });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Transactions
  app.get("/api/transactions", requireAuth, async (req, res) => {
    try {
      const transactions = await storage.getUserTransactions(req.session.userId!);
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Settings
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(publicSettings(settings));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/settings/links", async (req, res) => {
    try {
      const settings = sanitizeSettings(await storage.getSettings());
      res.json({
        supportLink: settings.supportLink || "",
        support2Link: settings.support2Link || "",
        channelLink: settings.channelLink || "",
        groupLink: settings.groupLink || "",
        supportType: settings.supportType || "",
        support2Type: settings.support2Type || "",
        channelType: settings.channelType || "",
        groupType: settings.groupType || "",
        supportLabel: settings.supportLabel || "",
        support2Label: settings.support2Label || "",
        channelLabel: settings.channelLabel || "",
        groupLabel: settings.groupLabel || "",
        withdrawalStartHour: settings.withdrawalStartHour || "",
        withdrawalEndHour: settings.withdrawalEndHour || "",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/settings/withdrawal", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      const withdrawalFees = Number(settings.withdrawalFees);
      const withdrawalStartHour = Number(settings.withdrawalStartHour);
      const withdrawalEndHour = Number(settings.withdrawalEndHour);
      const maxWithdrawalsPerDay = Number(settings.maxWithdrawalsPerDay);
      const minWithdrawal = Number(settings.minWithdrawal);
      const withdrawalConversionRate = Number(settings.withdrawalConversionRate);
      if (!Number.isFinite(withdrawalFees) || !Number.isFinite(withdrawalStartHour) ||
          !Number.isFinite(withdrawalEndHour) || !Number.isInteger(maxWithdrawalsPerDay) ||
          !Number.isFinite(minWithdrawal) || !Number.isFinite(withdrawalConversionRate)) {
        return res.status(500).json({ message: "Les réglages de retrait sont incomplets ou invalides" });
      }
      res.json({
        withdrawalFees,
        withdrawalStartHour,
        withdrawalEndHour,
        maxWithdrawalsPerDay,
        minWithdrawal,
        withdrawalConversionRate,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin routes
  app.get("/api/admin/identity-verifications", requireAdmin, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : "all";
      if (!["all", "pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid verification status" });
      }
      const verifications = await storage.getIdentityVerifications(status);
      res.json(verifications);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Unable to load identity verifications" });
    }
  });

  app.patch("/api/admin/identity-verifications/:id/status", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(getRouteParam(req, "id"), 10);
      const status = req.body?.status;
      if (!Number.isInteger(id) || !["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid verification status" });
      }

      const current = (await storage.getIdentityVerifications("all")).find((item) => item.id === id);
      if (!current) {
        return res.status(404).json({ message: "Identity verification not found" });
      }

      const verification = await storage.updateIdentityVerificationStatus(id, status);
      await storage.logAdminAction(
        req.session.userId!,
        `${status}_identity_verification`,
        current.userId,
        `Identity verification ${id} marked as ${status}`,
      );
      res.json({ verification });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Unable to update identity verification" });
    }
  });

  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const stats = await storage.getStats(startDate, endDate);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/deposits", requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as string || "pending";
      const deposits = await storage.getDeposits(status === "pending" ? "pending" : undefined);
      const filtered = status === "all" ? deposits : deposits.filter(d => d.status === status);
      res.json(filtered);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/deposits/soleaspay-stats", requireAdmin, async (req, res) => {
    try {
      const allDeposits = await storage.getDeposits();
      const soleaspayDeposits = allDeposits.filter((d: any) => d.soleaspayReference || d.soleaspayOrderId);

      const approvedSoleaspay = soleaspayDeposits.filter((d: any) => d.status === "approved");
      const totalAll = approvedSoleaspay.reduce((sum: number, d: any) => sum + Number(d.amount), 0);
      const countAll = approvedSoleaspay.length;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const approvedToday = approvedSoleaspay.filter((d: any) => new Date(d.createdAt) >= today);
      const totalToday = approvedToday.reduce((sum: number, d: any) => sum + Number(d.amount), 0);
      const countToday = approvedToday.length;

      const pendingSoleaspay = soleaspayDeposits.filter((d: any) => d.status === "pending" || d.status === "processing");
      const totalPending = pendingSoleaspay.reduce((sum: number, d: any) => sum + Number(d.amount), 0);
      const countPending = pendingSoleaspay.length;

      res.json({
        totalAll,
        countAll,
        totalToday,
        countToday,
        totalPending,
        countPending,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/deposits/:id/approve", requireAdmin, async (req, res) => {
    try {
      const deposit = await storage.claimAdminDepositApproval(parseInt(getRouteParam(req, "id")), req.session.userId!);
      if (!deposit) return res.status(409).json({ message: "This deposit has already been approved" });

      const user = await storage.getUser(deposit.userId);
      if (user) {
        const newBalance = parseFloat(user.balance) + deposit.amount;
        await storage.updateUser(user.id, { 
          balance: newBalance.toFixed(2),
          hasDeposited: true,
        });
        
        await storage.createTransaction({
          userId: user.id,
          type: "deposit",
          amount: deposit.amount.toString(),
          description: "Deposit approved",
        });
        await storage.processDepositReferralCommissions(deposit.userId, deposit.amount);
      }

      await storage.logAdminAction(req.session.userId!, "approve_deposit", deposit.userId, `Deposit ${deposit.id} approved: ${deposit.amount} GPB`);
      res.json(deposit);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/deposits/:id/reject", requireAdmin, async (req, res) => {
    try {
      const { ban } = req.body;
      const deposit = await storage.updateDeposit(parseInt(getRouteParam(req, "id")), {
        status: "rejected",
        processedAt: new Date(),
        processedBy: req.session.userId,
        screenshot: null,
      });

      if (ban) {
        await storage.updateUser(deposit.userId, { isBanned: true });
        await storage.logAdminAction(req.session.userId!, "ban_user", deposit.userId, `User banned for fraud`);
      }

      await storage.logAdminAction(req.session.userId!, "reject_deposit", deposit.userId, `Deposit ${deposit.id} rejected`);
      res.json(deposit);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/verify-pin", requireAuth, async (req, res) => {
    try {
      const { pin } = req.body;
      const user = await storage.getUser(req.session.userId!);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Acces refuse" });
      }
      
      // If password is not required for this admin, auto-verify
      if (user.isAdminPasswordRequired === false) {
        return res.json({ success: true });
      }

      if (!user.adminPin) {
        return res.status(400).json({ message: "PIN is not configured" });
      }
      
      if (user.adminPin !== pin) {
        return res.status(401).json({ message: "Code PIN incorrect" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/withdrawals", requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as string || "pending";
      const withdrawals = await storage.getWithdrawals(status === "pending" ? "pending" : undefined);
      const filtered = status === "all" ? withdrawals : withdrawals.filter(w => w.status === status);
      res.json(filtered);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/withdrawals/:id/approve", requireAdmin, async (req, res) => {
    try {
      const withdrawalId = parseInt(getRouteParam(req, "id"));
      const existingWithdrawal = await storage.getWithdrawals();
      const withdrawalData = existingWithdrawal.find(w => w.id === withdrawalId);
      
      if (!withdrawalData) {
        return res.status(404).json({ message: "Withdrawal not found" });
      }

      const withdrawal = await storage.updateWithdrawal(withdrawalId, {
        status: "approved",
        processedAt: new Date(),
        processedBy: req.session.userId,
      });

      await storage.logAdminAction(req.session.userId!, "approve_withdrawal", withdrawalData.userId, `Withdrawal ${withdrawal.id} approved: ${withdrawalData.netAmount} GPB`);
      res.json(withdrawal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/withdrawals/:id/reject", requireAdmin, async (req, res) => {
    try {
      const withdrawal = await storage.updateWithdrawal(parseInt(getRouteParam(req, "id")), {
        status: "rejected",
        processedAt: new Date(),
        processedBy: req.session.userId,
      });

      // Refund the user
      const user = await storage.getUser(withdrawal.userId);
      if (user) {
        const newBalance = parseFloat(user.balance) + withdrawal.amount;
        const newEarningsBalance = parseFloat(user.earningsBalance || "0") + withdrawal.amount;
        await storage.updateUser(user.id, {
          balance: newBalance.toFixed(2),
          earningsBalance: newEarningsBalance.toFixed(2),
        });
      }

      await storage.logAdminAction(req.session.userId!, "reject_withdrawal", withdrawal.userId, `Withdrawal ${withdrawal.id} rejected and refunded`);
      res.json(withdrawal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const search = (req.query.search as string) || "";
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      
      const { users: allUsers, total } = await storage.getAllUsers(search, limit, offset);
      const usersWithTeam = await Promise.all(allUsers.map(async (user) => {
        const teamStats = await storage.getTeamStatsSimple(user.id);
        return { ...user, password: undefined, ...teamStats, referrerName: null };
      }));
      res.json({ users: usersWithTeam, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/users/:id/team", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(getRouteParam(req, "id"));
      const team = await storage.getDetailedTeam(userId);
      res.json(team);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/users/:id/:action", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(getRouteParam(req, "id"));
      const action = getRouteParam(req, "action");
      const { value } = req.body;
      const adminUser = await storage.getUser(req.session.userId!);

      switch (action) {
        case "balance":
          await storage.updateUser(userId, { balance: value.toFixed(2) });
        await storage.logAdminAction(req.session.userId!, "update_balance", userId, `Balance updated: ${value} GPB`);
          break;
        case "password":
          await storage.updateUser(userId, { password: value });
          await storage.logAdminAction(req.session.userId!, "reset_password", userId, `Password reset`);
          break;
        case "toggle-ban":
          const user1 = await storage.getUser(userId);
          await storage.updateUser(userId, { isBanned: !user1?.isBanned });
          await storage.logAdminAction(req.session.userId!, "toggle_ban", userId, `Statut banni: ${!user1?.isBanned}`);
          break;
        case "toggle-withdrawal":
          const user2 = await storage.getUser(userId);
          await storage.updateUser(userId, { isWithdrawalBlocked: !user2?.isWithdrawalBlocked });
          await storage.logAdminAction(req.session.userId!, "toggle_withdrawal", userId, `Withdrawal blocked: ${!user2?.isWithdrawalBlocked}`);
          break;
        case "toggle-promoter":
          const user3 = await storage.getUser(userId);
          await storage.updateUser(userId, { isPromoter: !user3?.isPromoter, promoterSetBy: req.session.userId });
          await storage.logAdminAction(req.session.userId!, "toggle_promoter", userId, `Promoteur: ${!user3?.isPromoter}`);
          break;
        case "toggle-must-invite":
          const user4 = await storage.getUser(userId);
          await storage.updateUser(userId, { mustInviteToWithdraw: !user4?.mustInviteToWithdraw });
          await storage.logAdminAction(req.session.userId!, "toggle_must_invite", userId, `Doit inviter: ${!user4?.mustInviteToWithdraw}`);
          break;
        case "toggle-admin":
          if (!adminUser?.isSuperAdmin) {
            return res.status(403).json({ message: "Action restricted to the super admin" });
          }
          const user5 = await storage.getUser(userId);
          const newAdminStatus = !user5?.isAdmin;
          await storage.updateUser(userId, { 
            isAdmin: newAdminStatus,
            adminSetBy: req.session.userId,
            adminSetAt: new Date(),
            adminPin: newAdminStatus && value ? value : null,
          });
          await storage.logAdminAction(req.session.userId!, "toggle_admin", userId, `Admin: ${newAdminStatus}`);
          break;
        case "update-admin-pin":
          if (!adminUser?.isSuperAdmin) {
            return res.status(403).json({ message: "Action restricted to the super admin" });
          }
          await storage.updateUser(userId, { adminPin: value });
          await storage.logAdminAction(req.session.userId!, "update_admin_pin", userId, `Admin PIN updated`);
          break;
        case "toggle-password-required":
          if (!adminUser?.isSuperAdmin) {
            return res.status(403).json({ message: "Action restricted to the super admin" });
          }
          await storage.updateUser(userId, { isAdminPasswordRequired: value });
          await storage.logAdminAction(req.session.userId!, "toggle_password_required", userId, `Admin password required: ${value}`);
          break;
        case "assign-product":
          await storage.purchaseProduct(userId, value, true);
          await storage.logAdminAction(req.session.userId!, "assign_product", userId, `Product ${value} assigned`);
          break;
        case "revoke-product":
          await storage.removeUserProduct(userId, value);
          await storage.logAdminAction(req.session.userId!, "revoke_product", userId, `Product ${value} revoked`);
          break;
        case "toggle-super-admin":
          if (!adminUser?.isSuperAdmin) {
            return res.status(403).json({ message: "Action restricted to the super admin" });
          }
          const userSA = await storage.getUser(userId);
          const newSuperAdminStatus = !userSA?.isSuperAdmin;
          await storage.updateUser(userId, {
            isSuperAdmin: newSuperAdminStatus,
            isAdmin: newSuperAdminStatus ? true : userSA?.isAdmin,
          });
          await storage.logAdminAction(req.session.userId!, "toggle_super_admin", userId, `Super Admin: ${newSuperAdminStatus}`);
          break;
        case "toggle-banker":
          if (!adminUser?.isSuperAdmin && !adminUser?.isAdmin) {
            return res.status(403).json({ message: "Action restricted to administrators" });
          }
          const userBanker = await storage.getUser(userId);
          const newBankerStatus = !userBanker?.isBanker;
          await storage.updateUser(userId, { 
            isBanker: newBankerStatus,
            bankerSetBy: newBankerStatus ? req.session.userId : null,
          });
          await storage.logAdminAction(req.session.userId!, "toggle_banker", userId, `Bankier: ${newBankerStatus}`);
          break;
        default:
          return res.status(400).json({ message: "Action invalide" });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/products/all", requireAdmin, async (req, res) => {
    try {
      const allProducts = await storage.getProducts();
      res.json(allProducts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/users/:id/products", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(getRouteParam(req, "id"));
      const userProductsList = await storage.getAllUserProducts(userId);
      res.json(userProductsList.map(up => ({
        id: up.userProduct.id,
        productId: up.userProduct.productId,
        productName: up.product.name,
        productPrice: up.product.price,
        dailyEarnings: up.product.dailyEarnings,
        isActive: up.userProduct.isActive,
        purchaseDate: up.userProduct.purchaseDate,
        daysClaimed: up.product.cycleDays - up.userProduct.daysRemaining,
        totalCycle: up.product.cycleDays,
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/products", requireAdmin, async (req, res) => {
    try {
      const { name, price, dailyEarnings, cycleDays, imageUrl } = req.body;
      if (!name || !price || !dailyEarnings || !cycleDays) {
        return res.status(400).json({ message: "Required fields are missing" });
      }
      const priceInt = parseInt(price);
      const dailyInt = parseInt(dailyEarnings);
      const cycleInt = parseInt(cycleDays);
      const product = await storage.createProduct({
        name,
        price: priceInt,
        dailyEarnings: dailyInt,
        cycleDays: cycleInt,
        totalReturn: dailyInt * cycleInt,
        imageUrl: imageUrl || null,
        isFree: false,
        isActive: true,
        sortOrder: 0,
      });
      await storage.logAdminAction(req.session.userId!, "create_product", null, `Product ${product.name} created`);
      res.json(product);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const product = await storage.updateProduct(parseInt(getRouteParam(req, "id")), req.body);
      await storage.logAdminAction(req.session.userId!, "update_product", null, `Product ${product.id} updated`);
      res.json(product);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(getRouteParam(req, "id"));
      await storage.deleteProduct(id);
      await storage.logAdminAction(req.session.userId!, "delete_product", null, `Product ${id} deleted`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/channels", requireAdmin, async (req, res) => {
    try {
      const channels = await storage.getPaymentChannels();
      res.json(channels);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/channels", requireAdmin, async (req, res) => {
    try {
      const channel = await storage.createPaymentChannel({
        ...req.body,
        modifiedBy: req.session.userId,
      });
      await storage.logAdminAction(req.session.userId!, "create_channel", null, `Channel ${channel.name} created`);
      res.json(channel);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/admin/channels/:id", requireAdmin, async (req, res) => {
    try {
      const channel = await storage.updatePaymentChannel(parseInt(getRouteParam(req, "id")), {
        ...req.body,
        modifiedBy: req.session.userId,
      });
      await storage.logAdminAction(req.session.userId!, "update_channel", null, `Channel ${channel.name} updated`);
      res.json(channel);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/channels/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deletePaymentChannel(parseInt(getRouteParam(req, "id")));
      await storage.logAdminAction(req.session.userId!, "delete_channel", null, `Channel deleted`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(adminSettings(settings));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/blocked-ips", requireAdmin, async (_req, res) => {
    try {
      res.json(getBlockedIps(await storage.getSetting("blockedIps")));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/blocked-ips", requireAdmin, async (req, res) => {
    try {
      const ip = String(req.body?.ip || "").trim();
      const net = await import("net");
      if (!net.isIP(ip)) return res.status(400).json({ message: "Adresse IP invalide" });
      const blockedIps = getBlockedIps(await storage.getSetting("blockedIps"));
      if (!blockedIps.includes(ip)) {
        blockedIps.push(ip);
        await storage.setSetting("blockedIps", JSON.stringify(blockedIps), req.session.userId);
      }
      await storage.logAdminAction(req.session.userId!, "block_ip", null, `IP address blocked: ${ip}`);
      res.json({ success: true, ip });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/blocked-ips/:ip", requireAdmin, async (req, res) => {
    try {
      const ip = decodeURIComponent(getRouteParam(req, "ip"));
      const blockedIps = getBlockedIps(await storage.getSetting("blockedIps"));
      const nextIps = blockedIps.filter((value) => value !== ip);
      await storage.setSetting("blockedIps", JSON.stringify(nextIps), req.session.userId);
      await storage.logAdminAction(req.session.userId!, "unblock_ip", null, `IP address unblocked: ${ip}`);
      res.json({ success: true, ip });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const entries = Object.entries(req.body);
      for (const [key, value] of entries) {
        if (!ADMIN_SETTING_KEYS.has(key)) continue;
        if (SENSITIVE_SETTING_KEYS.has(key) && (value === "" || value === MASKED_SETTING_VALUE)) continue;
        await storage.setSetting(key, value as string, req.session.userId);
      }
      await storage.logAdminAction(req.session.userId!, "update_settings", null, `Settings updated`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Reset stats route (Super Admin only)
  app.post("/api/admin/reset-stats", requireAdmin, async (req, res) => {
    try {
      const adminUser = await storage.getUser(req.session.userId!);
      if (!adminUser?.isSuperAdmin) {
        return res.status(403).json({ message: "Action restricted to the super admin" });
      }

      await storage.resetStats();
      await storage.logAdminAction(req.session.userId!, "reset_stats", null, "Platform statistics reset");
      res.json({ success: true, message: "Statistics reset" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Gift Codes Routes
  app.get("/api/admin/gift-codes", requireAdmin, async (req, res) => {
    try {
      const codes = await storage.getAllGiftCodes();
      res.json(codes);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  const createGiftCodeSchema = z.object({
    code: z.string().min(1, "Code is required"),
    amount: z.number().positive("Amount must be positive").or(z.string().transform(Number)),
    maxUses: z.number().int().positive("Maximum uses must be positive"),
    expiresAt: z.string().refine((val) => !isNaN(Date.parse(val)), "Date d'expiration invalide"),
  });

  app.post("/api/admin/gift-codes", requireAdmin, async (req, res) => {
    try {
      const parseResult = createGiftCodeSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0]?.message || "Donnees invalides" });
      }

      const { code, amount, maxUses, expiresAt } = parseResult.data;

      const existingCode = await storage.getGiftCodeByCode(code);
      if (existingCode) {
        return res.status(400).json({ message: "This code already exists" });
      }

      const giftCode = await storage.createGiftCode({
        code,
        amount: amount.toString(),
        maxUses,
        expiresAt: new Date(expiresAt),
        createdBy: req.session.userId!,
      });

      await storage.logAdminAction(req.session.userId!, "create_gift_code", null, `Code cadeau cree: ${code} - ${amount} GPB`);
      res.json(giftCode);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/gift-codes/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(getRouteParam(req, "id"));
      await storage.deleteGiftCode(id);
      await storage.logAdminAction(req.session.userId!, "delete_gift_code", null, `Gift code deleted: #${id}`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  const claimGiftCodeSchema = z.object({
    code: z.string().min(1, "Code is required"),
  });

  app.post("/api/gift-codes/claim", requireAuth, async (req, res) => {
    try {
      const parseResult = claimGiftCodeSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0]?.message || "Code is required" });
      }

      const code = parseResult.data.code.trim().toUpperCase();
      const userId = req.session.userId!;

      const giftCode = await storage.getGiftCodeByCode(code);
      if (!giftCode) {
        return res.status(404).json({ message: "Code invalide" });
      }

      if (!giftCode.isActive) {
        return res.status(400).json({ message: "This code is no longer active" });
      }

      if (new Date() > new Date(giftCode.expiresAt)) {
        return res.status(400).json({ message: "This code has expired" });
      }

      if (giftCode.currentUses >= giftCode.maxUses) {
        return res.status(400).json({ message: "This code has reached its usage limit" });
      }

      const hasClaimed = await storage.hasUserClaimedGiftCode(userId, giftCode.id);
      if (hasClaimed) {
        return res.status(400).json({ message: "You have already used this code" });
      }

      await storage.claimGiftCode(userId, giftCode.id, parseFloat(giftCode.amount));
      
      res.json({ 
        success: true, 
        message: `Congratulations! You received ${parseFloat(giftCode.amount).toLocaleString()} GPB`,
        amount: parseFloat(giftCode.amount)
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Countries routes (public)
  app.get("/api/countries", async (req, res) => {
    try {
      res.json(await storage.getActiveCountries());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/deposit/provider/:country", requireAuth, async (req, res) => {
    try {
      const country = getRouteParam(req, "country").toUpperCase();
      if (!await getActiveCountry(country)) {
        return res.status(404).json({ message: "Country unavailable" });
      }
       const settings = await storage.getSettings();
      const enabledCodes = (value: string | undefined) =>
        (value || "").split(",").map(code => code.trim().toUpperCase()).filter(Boolean);
      const westpayCountries = enabledCodes(settings.westpayCountries);
      const providers: Array<{ provider: "westpay" | "sendavapay" | "ashtechpay"; name: string }> = [];
      if (settings.westpayEnabled === "true" &&
          (westpayCountries.length === 0 || westpayCountries.includes(country))) {
        providers.push({ provider: "westpay", name: settings.westpayChannelName || "WestPay" });
      }
      if (settings.sendavapayEnabled === "true") {
        providers.push({ provider: "sendavapay", name: settings.sendavapayChannelName || "SendavaPay" });
      }
      const ashtechCountries = enabledCodes(settings.ashtechCountries);
      if (settings.ashtechEnabled === "true" && isAshtechConfigured() &&
          (ashtechCountries.length === 0 || ashtechCountries.includes(country))) {
        providers.push({ provider: "ashtechpay", name: settings.ashtechChannelName || "AshtechPay" });
      }
      return res.json(providers[0]
        ? { ...providers[0], providers }
        : { provider: "manual", name: "Payment number", providers });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin country routes
  app.get("/api/admin/countries", requireAdmin, async (req, res) => {
    try {
      res.json(await storage.getCountries());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/countries", requireAdmin, async (req, res) => {
    try {
      const { code, name, currency, phonePrefix, operators, isActive } = req.body;
      const normalizedCode = String(code || "").trim().toUpperCase();
      if (!/^[A-Z]{2,10}$/.test(normalizedCode)) {
        return res.status(400).json({ message: "Country code must contain 2 to 10 letters" });
      }
      if (!name || !currency || !phonePrefix || typeof operators !== "string") {
        return res.status(400).json({ message: "All fields are required" });
      }
      const country = await storage.createCountry({
        code: normalizedCode, name: String(name).trim(), currency: String(currency).trim().toUpperCase(),
        phonePrefix: String(phonePrefix).replace(/\D/g, ""), operators, isActive: isActive !== false,
      });
      res.json(country);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/admin/countries/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(getRouteParam(req, "id"));
      const { code, name, currency, phonePrefix, operators, isActive } = req.body;
      const existing = await storage.getCountry(id);
      if (!existing) {
        return res.status(404).json({ message: "Country configuration not found" });
      }
      const updateData: any = {};
      if (code !== undefined) {
        const normalizedCode = String(code).trim().toUpperCase();
        if (!/^[A-Z]{2,10}$/.test(normalizedCode)) {
          return res.status(400).json({ message: "Country code must contain 2 to 10 letters" });
        }
        updateData.code = normalizedCode;
      }
      if (name !== undefined) updateData.name = String(name).trim();
      if (currency !== undefined) updateData.currency = String(currency).trim().toUpperCase();
      if (phonePrefix !== undefined) updateData.phonePrefix = String(phonePrefix).replace(/\D/g, "");
      if (operators !== undefined) updateData.operators = operators;
      if (isActive !== undefined) updateData.isActive = Boolean(isActive);
      const country = await storage.updateCountry(id, updateData);
      res.json(country);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/countries/:id", requireAdmin, async (req, res) => {
    try {
      const existing = await storage.getCountry(parseInt(getRouteParam(req, "id")));
      if (!existing) return res.status(404).json({ message: "Country configuration not found" });
      await storage.updateCountry(existing.id, { isActive: false });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== BANKER ROUTES ====================
  // Accessible to both admins and bankers

  app.get("/api/banker/deposits", requireBanker, async (req, res) => {
    try {
      const deposits = await storage.getDeposits();
      res.json(deposits);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/banker/withdrawals", requireBanker, async (req, res) => {
    try {
      const withdrawals = await storage.getWithdrawals();
      res.json(withdrawals);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/banker/deposits/:id/approve", requireBanker, async (req, res) => {
    try {
      const deposit = await storage.claimAdminDepositApproval(parseInt(getRouteParam(req, "id")), req.session.userId!);
      if (!deposit) return res.status(409).json({ message: "This deposit is already approved or unavailable" });
      const user = await storage.getUser(deposit.userId);
      if (user) {
        const newBalance = parseFloat(user.balance) + deposit.amount;
        await storage.updateUser(user.id, { balance: newBalance.toFixed(2), hasDeposited: true });
        await storage.createTransaction({ userId: user.id, type: "deposit", amount: deposit.amount.toString(), description: "Deposit approved by banker" });
        await storage.processDepositReferralCommissions(deposit.userId, deposit.amount);
      }
      await storage.logAdminAction(req.session.userId!, "approve_deposit", deposit.userId, `Deposit ${deposit.id} approved by banker: ${deposit.amount} GPB`);
      res.json(deposit);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/banker/deposits/:id/reject", requireBanker, async (req, res) => {
    try {
      const deposit = await storage.updateDeposit(parseInt(getRouteParam(req, "id")), {
        status: "rejected",
        processedAt: new Date(),
        processedBy: req.session.userId,
        screenshot: null,
      });
      await storage.logAdminAction(req.session.userId!, "reject_deposit", deposit.userId, `Deposit ${deposit.id} rejected by banker`);
      res.json(deposit);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/banker/withdrawals/:id/approve", requireBanker, async (req, res) => {
    try {
      const allWithdrawals = await storage.getWithdrawals();
      const withdrawalData = allWithdrawals.find(w => w.id === parseInt(getRouteParam(req, "id")));
      if (!withdrawalData) return res.status(404).json({ message: "Withdrawal not found" });
      const withdrawal = await storage.updateWithdrawal(parseInt(getRouteParam(req, "id")), {
        status: "approved",
        processedAt: new Date(),
        processedBy: req.session.userId,
      });
      await storage.logAdminAction(req.session.userId!, "approve_withdrawal", withdrawalData.userId, `Withdrawal ${withdrawal.id} approved by banker: ${withdrawalData.netAmount} GPB`);
      res.json(withdrawal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/banker/withdrawals/:id/reject", requireBanker, async (req, res) => {
    try {
      const withdrawal = await storage.updateWithdrawal(parseInt(getRouteParam(req, "id")), {
        status: "rejected",
        processedAt: new Date(),
        processedBy: req.session.userId,
      });
      const user = await storage.getUser(withdrawal.userId);
      if (user) {
        const newBalance = parseFloat(user.balance) + withdrawal.amount;
        const newEarningsBalance = parseFloat(user.earningsBalance || "0") + withdrawal.amount;
        await storage.updateUser(user.id, {
          balance: newBalance.toFixed(2),
          earningsBalance: newEarningsBalance.toFixed(2),
        });
      }
      await storage.logAdminAction(req.session.userId!, "reject_withdrawal", withdrawal.userId, `Withdrawal ${withdrawal.id} rejected by banker and refunded`);
      res.json(withdrawal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  return httpServer;
}
