import { 
  users, products, userProducts, deposits, withdrawals, withdrawalWallets,
  paymentChannels, paymentNumbers, stakingProducts, userStakings, referralCommissions, tasks, userTasks, transactions, platformSettings, adminAuditLog,
  giftCodes, giftCodeClaims, countries, identityVerifications, newsPosts, newsLikes, newsViews, supportMessages, supportMessageEditAudit, supportConversations,
  type User, type Product, type UserProduct, type Deposit, type Withdrawal, type WithdrawalWallet,
  type PaymentChannel, type PaymentNumber, type StakingProduct, type UserStaking, type ReferralCommission, type Task, type UserTask, type Transaction, type PlatformSetting,
  type GiftCode, type GiftCodeClaim, type Country, type IdentityVerification, type NewsPost, type InsertNewsPost,
  type SupportMessage, type InsertSupportMessage, type SupportMessageEditAudit, type SupportConversation
} from "@shared/schema";
import { db } from "./db";
import { eq, and, asc, desc, sql, gte, lte, or, isNull, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";
import { createUserAvatar } from "./user-avatar";

export type SupportMessageWithEditor = SupportMessage & {
  editedByName: string | null;
};

export type SupportMessageEditAuditWithEditor = SupportMessageEditAudit & {
  editedByName: string | null;
};

async function addSupportEditorNames(messages: SupportMessage[]): Promise<SupportMessageWithEditor[]> {
  const editorIds = Array.from(new Set(
    messages
      .filter((message) => message.editedByName === null)
      .map((message) => message.editedBy)
      .filter((editorId): editorId is number => editorId !== null),
  ));
  const editorRows = editorIds.length > 0
    ? await db.select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, editorIds))
    : [];
  const editorNames = new Map(editorRows.map((editor) => [editor.id, editor.fullName]));

  return messages.map((message) => ({
    ...message,
    // New edits carry an immutable name snapshot. The lookup is only for
    // legacy rows created before that snapshot was introduced.
    editedByName: message.editedByName ?? (
      message.editedBy === null ? null : editorNames.get(message.editedBy) ?? null
    ),
  }));
}

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByPhone(phone: string, country: string): Promise<User | undefined>;
  getUserByPhoneAnyCountry(phone: string): Promise<User | undefined>;
  getUserByReferralCode(code: string): Promise<User | undefined>;
  createUser(data: Partial<User>): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User>;
  getAllUsers(filter?: string, limit?: number, offset?: number): Promise<{ users: User[], total: number }>;

  // Identity verification
  getIdentityVerification(userId: number): Promise<IdentityVerification | undefined>;
  saveIdentityVerification(data: {
    userId: number;
    fullName: string;
    idNumber: string;
    idFront: string;
    idBack: string;
    selfie: string;
  }): Promise<IdentityVerification>;
  getIdentityVerifications(status?: string): Promise<Array<IdentityVerification & {
    user: Omit<User, "password" | "adminPin">;
  }>>;
  updateIdentityVerificationStatus(id: number, status: "pending" | "approved" | "rejected"): Promise<IdentityVerification>;
  
  // Products
  getProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(data: Partial<Product>): Promise<Product>;
  updateProduct(id: number, data: Partial<Product>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  
  // User Products
  getUserProducts(userId: number): Promise<(UserProduct & { product: Product })[]>;
  getAllUserProducts(userId: number): Promise<{ userProduct: UserProduct; product: Product }[]>;
  purchaseProduct(userId: number, productId: number, assignedByAdmin?: boolean): Promise<UserProduct>;
  removeUserProduct(userId: number, productId: number): Promise<void>;
  updateUserProduct(id: number, data: Partial<UserProduct>): Promise<UserProduct>;
  processEarnings(): Promise<void>;
  
  // Deposits
  createDeposit(data: Partial<Deposit>): Promise<Deposit>;
  getDeposit(id: number): Promise<Deposit | undefined>;
  getDepositBySendavapayReference(reference: string): Promise<Deposit | undefined>;
  getDepositByWestpayReference(reference: string): Promise<Deposit | undefined>;
  getDepositByAshtechReference(reference: string): Promise<Deposit | undefined>;
  getDepositByAshtechTransactionId(transactionId: string): Promise<Deposit | undefined>;
  getPendingAshtechDeposits(): Promise<Deposit[]>;
  claimDepositApproval(id: number): Promise<Deposit | undefined>;
  claimAdminDepositApproval(id: number, processedBy: number): Promise<Deposit | undefined>;
  getDeposits(status?: string): Promise<(Deposit & { user: User })[]>;
  getUserDeposits(userId: number): Promise<Deposit[]>;
  updateDeposit(id: number, data: Partial<Deposit>): Promise<Deposit>;
  cleanupDepositScreenshots(): Promise<void>;
  processDepositReferralCommissions(userId: number, amount: number): Promise<void>;
  
  // Withdrawals
  createWithdrawal(data: Partial<Withdrawal>): Promise<Withdrawal>;
  getWithdrawals(status?: string): Promise<(Withdrawal & { user: User })[]>;
  getUserWithdrawals(userId: number): Promise<Withdrawal[]>;
  updateWithdrawal(id: number, data: Partial<Withdrawal>): Promise<Withdrawal>;
  getUserWithdrawalCountToday(userId: number): Promise<number>;
  
  // Wallets
  getWallets(userId: number): Promise<WithdrawalWallet[]>;
  createWallet(data: Partial<WithdrawalWallet>): Promise<WithdrawalWallet>;
  deleteWallet(userId: number, id: number): Promise<void>;
  setDefaultWallet(userId: number, walletId: number): Promise<void>;
  getDefaultWallet(userId: number): Promise<WithdrawalWallet | undefined>;
  
  // Payment Channels
  getPaymentChannels(): Promise<PaymentChannel[]>;
  getActivePaymentChannels(): Promise<PaymentChannel[]>;
  getPaymentChannel(id: number): Promise<PaymentChannel | undefined>;
  createPaymentChannel(data: Partial<PaymentChannel>): Promise<PaymentChannel>;
  updatePaymentChannel(id: number, data: Partial<PaymentChannel>): Promise<PaymentChannel>;
  deletePaymentChannel(id: number): Promise<void>;
  
  // Referrals
  getReferrals(userId: number, level: number): Promise<User[]>;
  createReferralCommission(data: Partial<ReferralCommission>): Promise<ReferralCommission>;
  getUserCommissions(userId: number): Promise<number>;
  getTeamStats(userId: number): Promise<{
    level1Count: number;
    level2Count: number;
    level3Count: number;
    totalCommission: number;
    level1Commission: number;
    level2Commission: number;
    level3Commission: number;
    level1Invested: number;
    level2Invested: number;
    level3Invested: number;
    level1Recharged: number;
    teamSize: number;
    teamDepositsYesterday: number;
    teamDepositsToday: number;
    teamDepositsTotal: number;
    teamWithdrawalsToday: number;
    teamWithdrawalsTotal: number;
    teamRegistrationsToday: number;
  }>;
  getTeamStatsSimple(userId: number): Promise<{ level1Count: number; level2Count: number; level3Count: number; totalCommission: number }>;
  
  // Tasks
  getTasks(): Promise<Task[]>;
  getTasksWithStatus(userId: number): Promise<(Task & { isCompleted: boolean; canClaim: boolean; currentInvites: number })[]>;
  claimTask(userId: number, taskId: number): Promise<void>;

  // News and announcements
  getPublishedNews(userId: number): Promise<Array<NewsPost & { likesCount: number; viewsCount: number; likedByUser: boolean }>>;
  getAllNewsPosts(): Promise<Array<NewsPost & { likesCount: number; viewsCount: number }>>;
  createNewsPost(data: InsertNewsPost): Promise<NewsPost>;
  updateNewsPost(id: number, data: Partial<InsertNewsPost>): Promise<NewsPost | undefined>;
  deleteNewsPost(id: number): Promise<void>;
  toggleNewsLike(postId: number, userId: number): Promise<{ liked: boolean; likesCount: number }>;
  addNewsView(postId: number, userId: number): Promise<{ viewsCount: number }>;

  // Customer service chat
  getSupportMessages(userId: number): Promise<SupportMessage[]>;
  hasWithdrawalRequest(userId: number): Promise<boolean>;
  getAllSupportMessages(): Promise<Array<SupportMessageWithEditor & { userFullName: string; userPhone: string }>>;
  getAllSupportConversations(): Promise<Array<{
    userId: number;
    userFullName: string;
    userPhone: string;
    isClosed: boolean;
    closedAt: Date | null;
    unreadCount: number;
    messages: SupportMessageWithEditor[];
  }>>;
  getSupportConversationStatus(userId: number): Promise<{ isClosed: boolean; closedAt: Date | null }>;
  setSupportConversationClosed(userId: number, isClosed: boolean, adminId: number): Promise<SupportConversation>;
  reopenSupportConversation(userId: number): Promise<SupportConversation>;
  createWithdrawalSupportRequest(data: {
    userId: number;
    amount: number;
    requestMessage: string;
    automaticReply: string;
  }): Promise<{ requestMessage: SupportMessage; automaticReply: SupportMessage }>;
  finishWithdrawalConversation(data: {
    userId: number;
    adminId: number;
    automaticReply: string;
  }): Promise<{ automaticReply: SupportMessage; conversation: SupportConversation }>;
  markSupportConversationRead(userId: number): Promise<SupportConversation | undefined>;
  createSupportMessage(data: InsertSupportMessage): Promise<SupportMessage>;
  updateSupportMessage(id: number, message: string, adminId: number): Promise<SupportMessage | undefined>;
  getSupportMessageEditHistory(messageId: number): Promise<SupportMessageEditAuditWithEditor[]>;
  
  // Transactions
  createTransaction(data: Partial<Transaction>): Promise<Transaction>;
  getUserTransactions(userId: number): Promise<Transaction[]>;
  
  // Settings
  getSetting(key: string): Promise<string | null>;
  getSettings(): Promise<Record<string, string>>;
  setSetting(key: string, value: string, modifiedBy?: number): Promise<void>;
  
  // Admin
  getStats(): Promise<any>;
  logAdminAction(adminId: number, action: string, targetUserId: number | null, details: string): Promise<void>;
  resetStats(): Promise<void>;
  
  // Gift Codes
  getAllGiftCodes(): Promise<GiftCode[]>;
  getGiftCodeByCode(code: string): Promise<GiftCode | undefined>;
  createGiftCode(data: { code: string; amount: string; maxUses: number; expiresAt: Date; createdBy: number }): Promise<GiftCode>;
  deleteGiftCode(id: number): Promise<void>;
  hasUserClaimedGiftCode(userId: number, giftCodeId: number): Promise<boolean>;
  claimGiftCode(userId: number, giftCodeId: number, amount: number): Promise<void>;

  // Countries
  getCountries(): Promise<Country[]>;
  getActiveCountries(): Promise<Country[]>;
  getCountry(id: number): Promise<Country | undefined>;
  createCountry(data: Partial<Country>): Promise<Country>;
  updateCountry(id: number, data: Partial<Country>): Promise<Country>;
  deleteCountry(id: number): Promise<void>;

  // Payment Numbers
  getPaymentNumbers(): Promise<PaymentNumber[]>;
  getPaymentNumbersByCountry(country: string): Promise<PaymentNumber[]>;
  createPaymentNumber(data: Partial<PaymentNumber>): Promise<PaymentNumber>;
  updatePaymentNumber(id: number, data: Partial<PaymentNumber>): Promise<PaymentNumber>;
  deletePaymentNumber(id: number): Promise<void>;

  // Staking
  getStakingProducts(): Promise<StakingProduct[]>;
  getActiveStakingProducts(): Promise<StakingProduct[]>;
  getStakingProduct(id: number): Promise<StakingProduct | undefined>;
  createStakingProduct(data: Partial<StakingProduct>): Promise<StakingProduct>;
  updateStakingProduct(id: number, data: Partial<StakingProduct>): Promise<StakingProduct>;
  deleteStakingProduct(id: number): Promise<void>;
  purchaseStaking(userId: number, stakingProductId: number): Promise<UserStaking>;
  getUserStakings(userId: number): Promise<(UserStaking & { product: StakingProduct })[]>;
  getAllUserStakings(): Promise<(UserStaking & { product: StakingProduct; user: User })[]>;
  releaseMaturedStakings(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByPhone(phone: string, country: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(and(eq(users.phone, phone), eq(users.country, country)));
    return user || undefined;
  }

  async getUserByPhoneAnyCountry(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user || undefined;
  }

  async getUserByReferralCode(code: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      sql`UPPER(${users.referralCode}) = UPPER(${code})`
    );
    return user || undefined;
  }

  async createUser(data: Partial<User>): Promise<User> {
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const hashedPassword = await bcrypt.hash(data.password!, 10);
    const avatarUrl = createUserAvatar(`${data.phone || ""}:${data.fullName || ""}:${referralCode}`);

    const [user] = await db.insert(users).values({
      ...data,
      password: hashedPassword,
      avatarUrl,
      referralCode,
      balance: "0",
    } as any).returning();

    return user;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User> {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async getAllUsers(filter?: string, limit: number = 50, offset: number = 0): Promise<{ users: User[], total: number }> {
    let conditions: any[] = [];
    
    if (filter && filter.trim()) {
      const searchTerm = `%${filter.trim().toLowerCase()}%`;
      conditions.push(
        or(
          sql`LOWER(${users.phone}) LIKE ${searchTerm}`,
          sql`LOWER(${users.fullName}) LIKE ${searchTerm}`,
          sql`LOWER(${users.referralCode}) LIKE ${searchTerm}`
        )
      );
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereClause);
    
    const userList = await db.select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);
    
    return { users: userList, total: Number(countResult.count) };
  }

  async getIdentityVerification(userId: number): Promise<IdentityVerification | undefined> {
    const [verification] = await db.select()
      .from(identityVerifications)
      .where(eq(identityVerifications.userId, userId));
    return verification || undefined;
  }

  async saveIdentityVerification(data: {
    userId: number;
    fullName: string;
    idNumber: string;
    idFront: string;
    idBack: string;
    selfie: string;
  }): Promise<IdentityVerification> {
    const now = new Date();
    const [verification] = await db.insert(identityVerifications)
      .values({
        ...data,
        status: "pending",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: identityVerifications.userId,
        set: {
          fullName: data.fullName,
          idNumber: data.idNumber,
          idFront: data.idFront,
          idBack: data.idBack,
          selfie: data.selfie,
          status: "pending",
          updatedAt: now,
        },
      })
      .returning();
    return verification;
  }

  async getIdentityVerifications(status?: string): Promise<Array<IdentityVerification & {
    user: Omit<User, "password" | "adminPin">;
  }>> {
    let query = db.select({
      verification: identityVerifications,
      user: users,
    }).from(identityVerifications)
      .innerJoin(users, eq(identityVerifications.userId, users.id))
      .orderBy(desc(identityVerifications.updatedAt));

    if (status && status !== "all") {
      query = query.where(eq(identityVerifications.status, status)) as any;
    }

    const result = await query;
    return result.map(({ verification, user }) => {
      const { password: _password, adminPin: _adminPin, ...safeUser } = user;
      return { ...verification, user: safeUser };
    });
  }

  async updateIdentityVerificationStatus(
    id: number,
    status: "pending" | "approved" | "rejected",
  ): Promise<IdentityVerification> {
    const [verification] = await db.update(identityVerifications)
      .set({ status, updatedAt: new Date() })
      .where(eq(identityVerifications.id, id))
      .returning();
    return verification;
  }

  // Products
  async getProducts(): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.isActive, true)).orderBy(products.sortOrder);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async createProduct(data: Partial<Product>): Promise<Product> {
    const [product] = await db.insert(products).values(data as any).returning();
    return product;
  }

  async updateProduct(id: number, data: Partial<Product>): Promise<Product> {
    const [product] = await db.update(products).set(data).where(eq(products.id, id)).returning();
    return product;
  }

  async deleteProduct(id: number): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  // User Products
  async getUserProducts(userId: number): Promise<(UserProduct & { product: Product })[]> {
    const result = await db.select({
      userProduct: userProducts,
      product: products,
    }).from(userProducts)
      .innerJoin(products, eq(userProducts.productId, products.id))
      .where(and(eq(userProducts.userId, userId), eq(userProducts.isActive, true)));
    
    return result.map(r => ({ ...r.userProduct, product: r.product }));
  }

  async getAllUserProducts(userId: number): Promise<{ userProduct: UserProduct; product: Product }[]> {
    const result = await db.select({
      userProduct: userProducts,
      product: products,
    }).from(userProducts)
      .innerJoin(products, eq(userProducts.productId, products.id))
      .where(eq(userProducts.userId, userId));
    
    return result.sort((a, b) => {
      const dateA = a.userProduct.purchaseDate ? new Date(a.userProduct.purchaseDate).getTime() : 0;
      const dateB = b.userProduct.purchaseDate ? new Date(b.userProduct.purchaseDate).getTime() : 0;
      return dateB - dateA;
    });
  }

  async purchaseProduct(userId: number, productId: number, assignedByAdmin = false): Promise<UserProduct> {
    const product = await this.getProduct(productId);
    if (!product) throw new Error("Product not found");

    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    if (!product.isFree && !assignedByAdmin) {
      const balance = parseFloat(user.balance);
      if (balance < product.price) throw new Error("Solde insuffisant");
      
      // Check if this is user's first paid investment
      const existingPaidProducts = await db.select()
        .from(userProducts)
        .innerJoin(products, eq(userProducts.productId, products.id))
        .where(and(
          eq(userProducts.userId, userId),
          eq(products.isFree, false),
          eq(userProducts.assignedByAdmin, false)
        ));
      
      const isFirstInvestment = existingPaidProducts.length === 0;
      
      await this.updateUser(userId, { 
        balance: (balance - product.price).toFixed(2),
        hasActiveProduct: true,
      });

      await this.createTransaction({
        userId,
        type: "purchase",
        amount: (-product.price).toString(),
        description: `Achat ${product.name}`,
      });

      // Process referral commissions ONLY on first investment
      if (isFirstInvestment) {
        await this.processReferralCommissions(userId, product.price, productId);
      }
    } else {
      await this.updateUser(userId, { hasActiveProduct: true });
    }

    // Set lastEarningDate to now - first earnings will be credited 24h after purchase
    const [userProduct] = await db.insert(userProducts).values({
      userId,
      productId,
      daysRemaining: product.cycleDays,
      assignedByAdmin,
      lastEarningDate: new Date(),
    }).returning();

    return userProduct;
  }

  async updateUserProduct(id: number, data: Partial<UserProduct>): Promise<UserProduct> {
    const [updated] = await db.update(userProducts)
      .set(data as any)
      .where(eq(userProducts.id, id))
      .returning();
    return updated;
  }

  async removeUserProduct(userId: number, productId: number): Promise<void> {
    await db.update(userProducts)
      .set({ isActive: false })
      .where(and(eq(userProducts.userId, userId), eq(userProducts.productId, productId)));
  }

  async processReferralCommissions(userId: number, amount: number, productId: number): Promise<void> {
    const user = await this.getUser(userId);
    if (!user || !user.referredBy) return;

    const settings = await this.getSettings();
    const level1Rate = parseFloat(settings.level1Commission || "27") / 100;
    const level2Rate = parseFloat(settings.level2Commission || "2") / 100;
    const level3Rate = parseFloat(settings.level3Commission || "1") / 100;

    // Level 1
    const level1User = await this.getUserByReferralCode(user.referredBy);
    if (level1User) {
      const commission = amount * level1Rate;
      await this.updateUser(level1User.id, {
        balance: (parseFloat(level1User.balance) + commission).toFixed(2),
      });
      await this.createReferralCommission({
        userId: level1User.id,
        fromUserId: userId,
        level: 1,
        amount: commission.toFixed(2),
        productId,
      });
      await this.createTransaction({
        userId: level1User.id,
        type: "commission",
        amount: commission.toFixed(2),
        description: `Level 1 commission from ${user.fullName}`,
      });

      // Level 2
      if (level1User.referredBy) {
        const level2User = await this.getUserByReferralCode(level1User.referredBy);
        if (level2User) {
          const commission2 = amount * level2Rate;
          await this.updateUser(level2User.id, {
            balance: (parseFloat(level2User.balance) + commission2).toFixed(2),
          });
          await this.createReferralCommission({
            userId: level2User.id,
            fromUserId: userId,
            level: 2,
            amount: commission2.toFixed(2),
            productId,
          });
          await this.createTransaction({
            userId: level2User.id,
            type: "commission",
            amount: commission2.toFixed(2),
            description: `Level 2 commission`,
          });

          // Level 3
          if (level2User.referredBy) {
            const level3User = await this.getUserByReferralCode(level2User.referredBy);
            if (level3User) {
              const commission3 = amount * level3Rate;
              await this.updateUser(level3User.id, {
                balance: (parseFloat(level3User.balance) + commission3).toFixed(2),
              });
              await this.createReferralCommission({
                userId: level3User.id,
                fromUserId: userId,
                level: 3,
                amount: commission3.toFixed(2),
                productId,
              });
              await this.createTransaction({
                userId: level3User.id,
                type: "commission",
                amount: commission3.toFixed(2),
                description: `Level 3 commission`,
              });
            }
          }
        }
      }
    }
  }

  async processEarnings(): Promise<void> {
    const activeProducts = await db.select({
      userProduct: userProducts,
      product: products,
      user: users,
    }).from(userProducts)
      .innerJoin(products, eq(userProducts.productId, products.id))
      .innerJoin(users, eq(userProducts.userId, users.id))
      .where(and(eq(userProducts.isActive, true), sql`${userProducts.daysRemaining} > 0`));

    const now = new Date();
    
    const userEarnings = new Map<number, number>();
    
    for (const { userProduct, product, user } of activeProducts) {
      try {
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

          const currentTotal = userEarnings.get(user.id) || 0;
          userEarnings.set(user.id, currentTotal + totalEarningsForProduct);

          const newDaysRemaining = userProduct.daysRemaining - cyclesToCredit;
          const updateData: any = {
            lastEarningDate: newLastEarningDate,
            daysRemaining: newDaysRemaining,
            totalEarned: (parseFloat(userProduct.totalEarned || "0") + totalEarningsForProduct).toFixed(2),
          };
          
          if (newDaysRemaining <= 0) {
            updateData.isActive = false;
          }

          await db.update(userProducts).set(updateData).where(eq(userProducts.id, userProduct.id));

          for (let i = 0; i < cyclesToCredit; i++) {
            await this.createTransaction({
              userId: user.id,
              type: "earning",
              amount: earningsPerCycle.toString(),
              description: `Gains ${product.name}`,
            });
          }
        }
      } catch (productError) {
        console.error(`processEarnings error for product ${userProduct.id}:`, productError);
      }
    }

    for (const [userId, totalEarnings] of Array.from(userEarnings.entries())) {
      try {
        const freshUser = await this.getUser(userId);
        if (freshUser) {
          const newBalance = parseFloat(freshUser.balance || "0") + totalEarnings;
          const newTodayEarnings = parseFloat(freshUser.todayEarnings || "0") + totalEarnings;
          const newTotalEarnings = parseFloat(freshUser.totalEarnings || "0") + totalEarnings;
          
          await this.updateUser(userId, {
            balance: newBalance.toFixed(2),
            todayEarnings: newTodayEarnings.toFixed(2),
            totalEarnings: newTotalEarnings.toFixed(2),
          });
        }
      } catch (userError) {
        console.error(`processEarnings user update error for user ${userId}:`, userError);
      }
    }
  }

  // Deposits
  async createDeposit(data: Partial<Deposit>): Promise<Deposit> {
    const [deposit] = await db.insert(deposits).values(data as any).returning();
    return deposit;
  }

  async getDeposit(id: number): Promise<Deposit | undefined> {
    const [deposit] = await db.select().from(deposits).where(eq(deposits.id, id));
    return deposit;
  }

  async getDepositBySendavapayReference(reference: string): Promise<Deposit | undefined> {
    const [deposit] = await db.select().from(deposits).where(eq(deposits.sendavapayReference, reference));
    return deposit;
  }

  async getDepositByWestpayReference(reference: string): Promise<Deposit | undefined> {
    const [deposit] = await db.select().from(deposits).where(eq(deposits.westpayReference, reference));
    return deposit;
  }

  async getDepositByAshtechReference(reference: string): Promise<Deposit | undefined> {
    const [deposit] = await db.select().from(deposits).where(eq(deposits.ashtechReference, reference));
    return deposit;
  }

  async getDepositByAshtechTransactionId(transactionId: string): Promise<Deposit | undefined> {
    const [deposit] = await db.select().from(deposits).where(eq(deposits.ashtechTransactionId, transactionId));
    return deposit;
  }

  async getPendingAshtechDeposits(): Promise<Deposit[]> {
    return db.select().from(deposits).where(and(
      sql`${deposits.ashtechTransactionId} IS NOT NULL`,
      or(eq(deposits.status, "pending"), eq(deposits.status, "processing")),
    ));
  }

  async claimDepositApproval(id: number): Promise<Deposit | undefined> {
    const [deposit] = await db.update(deposits)
      .set({ status: "approved", processedAt: new Date() })
      .where(and(
        eq(deposits.id, id),
        sql`${deposits.status} NOT IN ('approved', 'rejected')`,
        isNull(deposits.processedAt),
      ))
      .returning();
    return deposit;
  }

  async claimAdminDepositApproval(id: number, processedBy: number): Promise<Deposit | undefined> {
    const [deposit] = await db.update(deposits)
      .set({ status: "approved", processedAt: new Date(), processedBy })
      .where(and(
        eq(deposits.id, id),
        sql`${deposits.status} <> 'approved'`,
      ))
      .returning();
    return deposit;
  }

  async getDeposits(status?: string): Promise<(Deposit & { user: User })[]> {
    let query = db.select({
      deposit: deposits,
      user: users,
    }).from(deposits)
      .innerJoin(users, eq(deposits.userId, users.id))
      .orderBy(desc(deposits.createdAt));
    
    if (status && status !== "all") {
      query = query.where(eq(deposits.status, status)) as any;
    }
    
    const result = await query;
    return result.map(r => ({ ...r.deposit, user: r.user }));
  }

  async getUserDeposits(userId: number): Promise<Deposit[]> {
    return await db.select().from(deposits).where(eq(deposits.userId, userId)).orderBy(desc(deposits.createdAt));
  }

  async updateDeposit(id: number, data: Partial<Deposit>): Promise<Deposit> {
    const [deposit] = await db.update(deposits).set(data).where(eq(deposits.id, id)).returning();
    return deposit;
  }

  async cleanupDepositScreenshots(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.update(deposits)
      .set({ screenshot: null })
      .where(
        and(
          sql`${deposits.screenshot} IS NOT NULL`,
          or(
            and(eq(deposits.status, "approved"), lte(deposits.processedAt, cutoff)),
            and(eq(deposits.status, "rejected"), lte(deposits.processedAt, cutoff)),
          )
        )
      );
  }

  async processDepositReferralCommissions(userId: number, amount: number): Promise<void> {
    const user = await this.getUser(userId);
    if (!user || !user.referredBy) return;

    const settings = await this.getSettings();
    const level1Rate = parseFloat(settings.depositCommissionLevel1 || "5") / 100;
    const level2Rate = parseFloat(settings.depositCommissionLevel2 || "2") / 100;
    const level3Rate = parseFloat(settings.depositCommissionLevel3 || "1") / 100;

    const level1User = await this.getUserByReferralCode(user.referredBy);
    if (level1User) {
      const commission = Math.round(amount * level1Rate);
      if (commission > 0) {
        await this.updateUser(level1User.id, {
          balance: (parseFloat(level1User.balance) + commission).toFixed(2),
        });
        await this.createTransaction({
          userId: level1User.id,
          type: "deposit_commission",
          amount: commission.toString(),
          description: `Level 1 deposit commission`,
        });
      }

      if (level1User.referredBy) {
        const level2User = await this.getUserByReferralCode(level1User.referredBy);
        if (level2User) {
          const comm2 = Math.round(amount * level2Rate);
          if (comm2 > 0) {
            await this.updateUser(level2User.id, {
              balance: (parseFloat(level2User.balance) + comm2).toFixed(2),
            });
            await this.createTransaction({
              userId: level2User.id,
              type: "deposit_commission",
              amount: comm2.toString(),
              description: `Level 2 deposit commission`,
            });
          }

          if (level2User.referredBy) {
            const level3User = await this.getUserByReferralCode(level2User.referredBy);
            if (level3User) {
              const comm3 = Math.round(amount * level3Rate);
              if (comm3 > 0) {
                await this.updateUser(level3User.id, {
                  balance: (parseFloat(level3User.balance) + comm3).toFixed(2),
                });
                await this.createTransaction({
                  userId: level3User.id,
                  type: "deposit_commission",
                  amount: comm3.toString(),
                  description: `Level 3 deposit commission`,
                });
              }
            }
          }
        }
      }
    }
  }

  // Withdrawals
  async createWithdrawal(data: Partial<Withdrawal>): Promise<Withdrawal> {
    const [withdrawal] = await db.insert(withdrawals).values(data as any).returning();
    return withdrawal;
  }

  async getWithdrawals(status?: string): Promise<(Withdrawal & { user: User })[]> {
    let query = db.select({
      withdrawal: withdrawals,
      user: users,
    }).from(withdrawals)
      .innerJoin(users, eq(withdrawals.userId, users.id))
      .orderBy(desc(withdrawals.createdAt));
    
    if (status && status !== "all") {
      query = query.where(eq(withdrawals.status, status)) as any;
    }
    
    const result = await query;
    return result.map(r => ({ ...r.withdrawal, user: r.user }));
  }

  async getUserWithdrawals(userId: number): Promise<Withdrawal[]> {
    return await db.select().from(withdrawals).where(eq(withdrawals.userId, userId)).orderBy(desc(withdrawals.createdAt));
  }

  async updateWithdrawal(id: number, data: Partial<Withdrawal>): Promise<Withdrawal> {
    const [withdrawal] = await db.update(withdrawals).set(data).where(eq(withdrawals.id, id)).returning();
    return withdrawal;
  }

  async getUserWithdrawalCountToday(userId: number): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(withdrawals)
      .where(and(
        eq(withdrawals.userId, userId),
        gte(withdrawals.createdAt, today)
      ));
    
    return result[0]?.count || 0;
  }

  // Wallets
  async getWallets(userId: number): Promise<WithdrawalWallet[]> {
    return await db.select().from(withdrawalWallets).where(eq(withdrawalWallets.userId, userId));
  }

  async createWallet(data: Partial<WithdrawalWallet>): Promise<WithdrawalWallet> {
    // Set other wallets as non-default
    await db.update(withdrawalWallets).set({ isDefault: false }).where(eq(withdrawalWallets.userId, data.userId!));
    
    const [wallet] = await db.insert(withdrawalWallets).values({ ...data, isDefault: true } as any).returning();
    return wallet;
  }

  async deleteWallet(userId: number, id: number): Promise<void> {
    await db.delete(withdrawalWallets).where(and(
      eq(withdrawalWallets.id, id),
      eq(withdrawalWallets.userId, userId),
    ));
  }

  async setDefaultWallet(userId: number, walletId: number): Promise<void> {
    const [wallet] = await db.select().from(withdrawalWallets).where(and(
      eq(withdrawalWallets.id, walletId),
      eq(withdrawalWallets.userId, userId),
    ));
    if (!wallet) throw new Error("Wallet not found");
    await db.update(withdrawalWallets).set({ isDefault: false }).where(eq(withdrawalWallets.userId, userId));
    await db.update(withdrawalWallets).set({ isDefault: true }).where(and(
      eq(withdrawalWallets.id, walletId),
      eq(withdrawalWallets.userId, userId),
    ));
  }

  async getDefaultWallet(userId: number): Promise<WithdrawalWallet | undefined> {
    const [wallet] = await db.select().from(withdrawalWallets)
      .where(and(eq(withdrawalWallets.userId, userId), eq(withdrawalWallets.isDefault, true)));
    return wallet || undefined;
  }

  // Payment Channels
  async getPaymentChannels(): Promise<PaymentChannel[]> {
    return await db.select().from(paymentChannels);
  }

  async getActivePaymentChannels(): Promise<PaymentChannel[]> {
    return await db.select().from(paymentChannels).where(eq(paymentChannels.isActive, true));
  }

  async getPaymentChannel(id: number): Promise<PaymentChannel | undefined> {
    const [channel] = await db.select().from(paymentChannels).where(eq(paymentChannels.id, id));
    return channel || undefined;
  }

  async createPaymentChannel(data: Partial<PaymentChannel>): Promise<PaymentChannel> {
    const [channel] = await db.insert(paymentChannels).values(data as any).returning();
    return channel;
  }

  async updatePaymentChannel(id: number, data: Partial<PaymentChannel>): Promise<PaymentChannel> {
    const [channel] = await db.update(paymentChannels).set({ ...data, modifiedAt: new Date() }).where(eq(paymentChannels.id, id)).returning();
    return channel;
  }

  async deletePaymentChannel(id: number): Promise<void> {
    await db.delete(paymentChannels).where(eq(paymentChannels.id, id));
  }

  // Referrals
  async getReferrals(userId: number, level: number): Promise<User[]> {
    const user = await this.getUser(userId);
    if (!user) return [];

    if (level === 1) {
      return await db.select().from(users).where(eq(users.referredBy, user.referralCode));
    }
    
    // For level 2 and 3, we need recursive queries
    const level1 = await this.getReferrals(userId, 1);
    if (level === 2) {
      const level2: User[] = [];
      for (const l1 of level1) {
        const refs = await db.select().from(users).where(eq(users.referredBy, l1.referralCode));
        level2.push(...refs);
      }
      return level2;
    }
    
    if (level === 3) {
      const level2 = await this.getReferrals(userId, 2);
      const level3: User[] = [];
      for (const l2 of level2) {
        const refs = await db.select().from(users).where(eq(users.referredBy, l2.referralCode));
        level3.push(...refs);
      }
      return level3;
    }
    
    return [];
  }

  async createReferralCommission(data: Partial<ReferralCommission>): Promise<ReferralCommission> {
    const [commission] = await db.insert(referralCommissions).values(data as any).returning();
    return commission;
  }

  async getUserCommissions(userId: number): Promise<number> {
    const result = await db.select({ total: sql<string>`COALESCE(SUM(${referralCommissions.amount}), 0)` })
      .from(referralCommissions)
      .where(eq(referralCommissions.userId, userId));
    return parseFloat(result[0]?.total || "0");
  }

  async getTeamStatsSimple(userId: number): Promise<{ level1Count: number; level2Count: number; level3Count: number; totalCommission: number }> {
    const user = await this.getUser(userId);
    if (!user) return { level1Count: 0, level2Count: 0, level3Count: 0, totalCommission: 0 };

    const level1Result = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.referredBy, user.referralCode));
    const level1Count = Number(level1Result[0]?.count || 0);

    let level2Count = 0;
    let level3Count = 0;
    
    if (level1Count > 0) {
      const level1Codes = await db.select({ code: users.referralCode })
        .from(users)
        .where(eq(users.referredBy, user.referralCode));
      
      if (level1Codes.length > 0) {
        const level2Result = await db.select({ count: sql<number>`count(*)` })
          .from(users)
          .where(sql`${users.referredBy} IN (${sql.join(level1Codes.map(u => sql`${u.code}`), sql`, `)})`);
        level2Count = Number(level2Result[0]?.count || 0);
        
        if (level2Count > 0) {
          const level2Codes = await db.select({ code: users.referralCode })
            .from(users)
            .where(sql`${users.referredBy} IN (${sql.join(level1Codes.map(u => sql`${u.code}`), sql`, `)})`);
          
          if (level2Codes.length > 0) {
            const level3Result = await db.select({ count: sql<number>`count(*)` })
              .from(users)
              .where(sql`${users.referredBy} IN (${sql.join(level2Codes.map(u => sql`${u.code}`), sql`, `)})`);
            level3Count = Number(level3Result[0]?.count || 0);
          }
        }
      }
    }

    const commResult = await db.select({ total: sql<string>`COALESCE(SUM(${referralCommissions.amount}), 0)` })
      .from(referralCommissions)
      .where(eq(referralCommissions.userId, userId));
    const totalCommission = parseFloat(commResult[0]?.total || "0");

    return { level1Count, level2Count, level3Count, totalCommission };
  }

  async getTeamStats(userId: number): Promise<{
    level1Count: number;
    level2Count: number;
    level3Count: number;
    totalCommission: number;
    level1Commission: number;
    level2Commission: number;
    level3Commission: number;
    level1Invested: number;
    level2Invested: number;
    level3Invested: number;
    level1Recharged: number;
    teamSize: number;
    teamDepositsYesterday: number;
    teamDepositsToday: number;
    teamDepositsTotal: number;
    teamWithdrawalsToday: number;
    teamWithdrawalsTotal: number;
    teamRegistrationsToday: number;
  }> {
    const level1 = await this.getReferrals(userId, 1);
    const level2 = await this.getReferrals(userId, 2);
    const level3 = await this.getReferrals(userId, 3);
    const totalCommission = await this.getUserCommissions(userId);
    const teamMembers = [...level1, ...level2, ...level3];
    const teamMemberIds = teamMembers.map((member) => member.id);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const teamDeposits = teamMemberIds.length > 0
      ? await db.select({ amount: deposits.amount, createdAt: deposits.createdAt })
        .from(deposits)
        .where(and(
          inArray(deposits.userId, teamMemberIds),
          eq(deposits.status, "approved"),
        ))
      : [];
    const teamDepositsTotal = teamDeposits.reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);
    const teamDepositsToday = teamDeposits
      .filter((deposit) => new Date(deposit.createdAt) >= startOfToday)
      .reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);
    const teamDepositsYesterday = teamDeposits
      .filter((deposit) => {
        const createdAt = new Date(deposit.createdAt);
        return createdAt >= startOfYesterday && createdAt < startOfToday;
      })
      .reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);
    const teamWithdrawals = teamMemberIds.length > 0
      ? await db.select({ amount: withdrawals.amount, createdAt: withdrawals.createdAt })
        .from(withdrawals)
        .where(and(
          inArray(withdrawals.userId, teamMemberIds),
          eq(withdrawals.status, "approved"),
        ))
      : [];
    const teamWithdrawalsTotal = teamWithdrawals.reduce((sum, withdrawal) => sum + Number(withdrawal.amount || 0), 0);
    const teamWithdrawalsToday = teamWithdrawals
      .filter((withdrawal) => new Date(withdrawal.createdAt) >= startOfToday)
      .reduce((sum, withdrawal) => sum + Number(withdrawal.amount || 0), 0);
    const teamRegistrationsToday = teamMembers
      .filter((member) => new Date(member.createdAt) >= startOfToday)
      .length;

    const getCommissionByLevel = async (level: number) => {
      const result = await db.select({ total: sql<string>`COALESCE(SUM(${referralCommissions.amount}), 0)` })
        .from(referralCommissions)
        .where(and(eq(referralCommissions.userId, userId), eq(referralCommissions.level, level)));
      return parseFloat(result[0]?.total || "0");
    };

    const countInvested = async (userList: User[]) => {
      let count = 0;
      for (const u of userList) {
        if (u.hasActiveProduct) count++;
      }
      return count;
    };

    const countRecharged = async (userList: User[]) => {
      let count = 0;
      for (const u of userList) {
        const userDeposits = await db.select().from(deposits)
          .where(and(eq(deposits.userId, u.id), eq(deposits.status, "approved")));
        if (userDeposits.length > 0) count++;
      }
      return count;
    };

    return {
      level1Count: level1.length,
      level2Count: level2.length,
      level3Count: level3.length,
      totalCommission,
      level1Commission: await getCommissionByLevel(1),
      level2Commission: await getCommissionByLevel(2),
      level3Commission: await getCommissionByLevel(3),
      level1Invested: await countInvested(level1),
      level2Invested: await countInvested(level2),
      level3Invested: await countInvested(level3),
      level1Recharged: await countRecharged(level1),
      teamSize: teamMembers.length,
      teamDepositsYesterday,
      teamDepositsToday,
      teamDepositsTotal,
      teamWithdrawalsToday,
      teamWithdrawalsTotal,
      teamRegistrationsToday,
    };
  }

  async getDetailedTeam(userId: number): Promise<any> {
    const level1 = await this.getReferrals(userId, 1);
    const level2 = await this.getReferrals(userId, 2);
    const level3 = await this.getReferrals(userId, 3);

    const enrichUser = async (user: User) => {
      const userProductsList = await db.select({ 
        productId: userProducts.productId,
        productName: products.name,
        productPrice: products.price,
        purchaseDate: userProducts.purchaseDate,
        isActive: userProducts.isActive,
      })
      .from(userProducts)
      .innerJoin(products, eq(userProducts.productId, products.id))
      .where(eq(userProducts.userId, user.id));
      
      const totalInvested = userProductsList
        .filter(p => !p.isActive || p.isActive)
        .reduce((sum, p) => sum + p.productPrice, 0);
      const [commissionResult] = await db
        .select({
          total: sql<string>`COALESCE(SUM(CAST(${referralCommissions.amount} AS DECIMAL)), 0)`,
        })
        .from(referralCommissions)
        .where(and(
          eq(referralCommissions.userId, userId),
          eq(referralCommissions.fromUserId, user.id),
        ));
      const vipLevel = userProductsList.reduce((highest, product) => {
        const match = product.productName.match(/(?:vip|hsbc|teld)\s*(\d+)/i);
        return Math.max(highest, match ? Number(match[1]) : 0);
      }, 0) || (user.hasActiveProduct ? 1 : 0);

      return {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        country: user.country,
        balance: user.balance,
        hasActiveProduct: user.hasActiveProduct,
        hasDeposited: user.hasDeposited,
        createdAt: user.createdAt,
        totalInvested,
        totalRevenue: Number(commissionResult?.total || 0),
        vipLevel,
        products: userProductsList,
      };
    };

    const level1Details = await Promise.all(level1.map(enrichUser));
    const level2Details = await Promise.all(level2.map(enrichUser));
    const level3Details = await Promise.all(level3.map(enrichUser));

    return {
      level1: level1Details,
      level2: level2Details,
      level3: level3Details,
      totalLevel1Invested: level1Details.reduce((sum, u) => sum + u.totalInvested, 0),
      totalLevel2Invested: level2Details.reduce((sum, u) => sum + u.totalInvested, 0),
      totalLevel3Invested: level3Details.reduce((sum, u) => sum + u.totalInvested, 0),
    };
  }

  // Tasks
  async getTasks(): Promise<Task[]> {
    return await db.select().from(tasks).where(eq(tasks.isActive, true)).orderBy(tasks.sortOrder);
  }

  async getTasksWithStatus(userId: number): Promise<(Task & { isCompleted: boolean; canClaim: boolean; currentInvites: number })[]> {
    const allTasks = await this.getTasks();
    const user = await this.getUser(userId);
    if (!user) return [];

    const level1Refs = await this.getReferrals(userId, 1);
    
    let currentInvites = 0;
    for (const ref of level1Refs) {
      const hasApprovedDeposit = ref.hasDeposited === true;
      
      if (!hasApprovedDeposit) {
        const refDeposits = await db.select().from(deposits)
          .where(and(eq(deposits.userId, ref.id), eq(deposits.status, "approved")))
          .limit(1);
        if (refDeposits.length > 0) {
          currentInvites++;
          continue;
        }
      } else {
        currentInvites++;
        continue;
      }

      const refProducts = await db.select()
        .from(userProducts)
        .innerJoin(products, eq(userProducts.productId, products.id))
        .where(and(
          eq(userProducts.userId, ref.id),
          eq(products.isFree, false)
        ))
        .limit(1);

      if (refProducts.length > 0) {
        currentInvites++;
      }
    }

    const completedTasks = await db.select().from(userTasks).where(eq(userTasks.userId, userId));
    const completedIds = new Set(completedTasks.map(t => t.taskId));

    return allTasks.map(task => ({
      ...task,
      isCompleted: completedIds.has(task.id),
      canClaim: !completedIds.has(task.id) && currentInvites >= task.requiredInvites,
      currentInvites: currentInvites,
    }));
  }

  async claimTask(userId: number, taskId: number): Promise<void> {
    const tasksStatus = await this.getTasksWithStatus(userId);
    const taskStatus = tasksStatus.find(t => t.id === taskId);

    if (!taskStatus) throw new Error("Task not found");
    if (taskStatus.isCompleted) throw new Error("Task already claimed");
    if (!taskStatus.canClaim) throw new Error("Conditions not met (top-up and purchase required)");

    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    await db.insert(userTasks).values({ userId, taskId });
    
    const newBalance = parseFloat(user.balance) + taskStatus.reward;
    await this.updateUser(userId, { balance: newBalance.toFixed(2) });
    
    await this.createTransaction({
      userId,
      type: "task_reward",
      amount: taskStatus.reward.toString(),
      description: `Reward: ${taskStatus.name}`,
    });
  }

  // News and announcements
  async getPublishedNews(userId: number): Promise<Array<NewsPost & { likesCount: number; viewsCount: number; likedByUser: boolean }>> {
    const rows = await db.select({
      post: newsPosts,
      likedByUser: sql<boolean>`EXISTS (
        SELECT 1 FROM news_likes
        WHERE news_likes.post_id = ${newsPosts.id}
          AND news_likes.user_id = ${userId}
      )`,
    })
      .from(newsPosts)
      .where(eq(newsPosts.isPublished, true))
      .orderBy(desc(newsPosts.createdAt));

    return rows.map(({ post, likedByUser }) => ({
      ...post,
      likesCount: Number(post.likesCount || 0),
      viewsCount: Number(post.viewsCount || 0),
      likedByUser: Boolean(likedByUser),
    }));
  }

  async getAllNewsPosts(): Promise<Array<NewsPost & { likesCount: number; viewsCount: number }>> {
    const rows = await db.select({
      post: newsPosts,
    })
      .from(newsPosts)
      .orderBy(desc(newsPosts.createdAt));

    return rows.map(({ post }) => ({
      ...post,
      likesCount: Number(post.likesCount || 0),
      viewsCount: Number(post.viewsCount || 0),
    }));
  }

  async createNewsPost(data: InsertNewsPost): Promise<NewsPost> {
    const [post] = await db.insert(newsPosts).values(data).returning();
    return post;
  }

  async updateNewsPost(id: number, data: Partial<InsertNewsPost>): Promise<NewsPost | undefined> {
    const [post] = await db.update(newsPosts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(newsPosts.id, id))
      .returning();
    return post;
  }

  async deleteNewsPost(id: number): Promise<void> {
    await db.delete(newsPosts).where(eq(newsPosts.id, id));
  }

  async toggleNewsLike(postId: number, userId: number): Promise<{ liked: boolean; likesCount: number }> {
    const [existing] = await db.select()
      .from(newsLikes)
      .where(and(eq(newsLikes.postId, postId), eq(newsLikes.userId, userId)))
      .limit(1);
    let liked = Boolean(existing);

    if (existing) {
      await db.delete(newsLikes).where(eq(newsLikes.id, existing.id));
      await db.update(newsPosts)
        .set({
          likesCount: sql`GREATEST(${newsPosts.likesCount} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(newsPosts.id, postId));
    } else {
      const [inserted] = await db.insert(newsLikes)
        .values({ postId, userId })
        .onConflictDoNothing()
        .returning({ id: newsLikes.id });
      liked = Boolean(inserted);
      if (inserted) {
        await db.update(newsPosts)
          .set({
            likesCount: sql`${newsPosts.likesCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(newsPosts.id, postId));
      }
    }

    const [post] = await db.select({ likesCount: newsPosts.likesCount })
      .from(newsPosts)
      .where(eq(newsPosts.id, postId));
    return { liked, likesCount: Number(post?.likesCount || 0) };
  }

  async addNewsView(postId: number, userId: number): Promise<{ viewsCount: number }> {
    const [inserted] = await db.insert(newsViews)
      .values({ postId, userId })
      .onConflictDoNothing()
      .returning({ id: newsViews.id });

    if (inserted) {
      await db.update(newsPosts)
        .set({
          viewsCount: sql`${newsPosts.viewsCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(newsPosts.id, postId));
    }

    const [post] = await db.select({ viewsCount: newsPosts.viewsCount })
      .from(newsPosts)
      .where(eq(newsPosts.id, postId));
    return { viewsCount: Number(post?.viewsCount || 0) };
  }

  // Customer service chat
  async getSupportMessages(userId: number): Promise<SupportMessage[]> {
    return await db.select()
      .from(supportMessages)
      .where(eq(supportMessages.userId, userId))
      .orderBy(asc(supportMessages.createdAt));
  }

  async hasWithdrawalRequest(userId: number): Promise<boolean> {
    const [request] = await db.select({ id: supportMessages.id })
      .from(supportMessages)
      .where(and(
        eq(supportMessages.userId, userId),
        eq(supportMessages.senderRole, "user"),
        sql`${supportMessages.message} LIKE ${"%Numéro de retrait :%"}`,
      ))
      .limit(1);
    return Boolean(request);
  }

  async getAllSupportMessages(): Promise<Array<SupportMessageWithEditor & { userFullName: string; userPhone: string }>> {
    const rows = await db.select({
      message: supportMessages,
      userFullName: users.fullName,
      userPhone: users.phone,
    })
      .from(supportMessages)
      .innerJoin(users, eq(supportMessages.userId, users.id))
      .orderBy(asc(supportMessages.createdAt));

    const messages = rows.map(({ message, userFullName, userPhone }) => ({
      ...message,
      userFullName,
      userPhone,
    }));
    const messagesWithEditors = await addSupportEditorNames(messages);
    return messagesWithEditors.map((message, index) => ({
      ...message,
      userFullName: messages[index].userFullName,
      userPhone: messages[index].userPhone,
    }));
  }

  async getAllSupportConversations(): Promise<Array<{
    userId: number;
    userFullName: string;
    userPhone: string;
    isClosed: boolean;
    closedAt: Date | null;
    unreadCount: number;
    messages: SupportMessageWithEditor[];
  }>> {
    const [userRows, messageRows] = await Promise.all([
      db.select({
        userId: users.id,
        userFullName: users.fullName,
        userPhone: users.phone,
        isAdmin: users.isAdmin,
        isClosed: supportConversations.isClosed,
        closedAt: supportConversations.closedAt,
        adminReadAt: supportConversations.adminReadAt,
        createdAt: users.createdAt,
      })
        .from(users)
        .leftJoin(supportConversations, eq(supportConversations.userId, users.id))
        .orderBy(desc(users.createdAt)),
      db.select()
        .from(supportMessages)
        .orderBy(asc(supportMessages.createdAt)),
    ]);

    const messagesWithEditors = await addSupportEditorNames(messageRows);
    const messagesByUser = new Map<number, SupportMessageWithEditor[]>();
    for (const message of messagesWithEditors) {
      const messages = messagesByUser.get(message.userId) || [];
      messages.push(message);
      messagesByUser.set(message.userId, messages);
    }

    return userRows
      // An account can be promoted to admin after it has already used the
      // customer chat. Keep that conversation visible so those messages do
      // not disappear from the support panel; do not create empty admin
      // conversations for accounts that have never used support.
      .filter((user) => !user.isAdmin || (messagesByUser.get(user.userId)?.length ?? 0) > 0)
      .map((user) => ({
        userId: user.userId,
        userFullName: user.userFullName,
        userPhone: user.userPhone,
        isClosed: user.isClosed ?? false,
        closedAt: user.closedAt ?? null,
        unreadCount: (messagesByUser.get(user.userId) || []).filter((message) =>
          message.senderRole === "user" &&
          (!user.adminReadAt || message.createdAt.getTime() > user.adminReadAt.getTime())
        ).length,
        messages: messagesByUser.get(user.userId) || [],
      }))
      .sort((a, b) => {
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
        const aLast = a.messages[a.messages.length - 1]?.createdAt?.getTime() || 0;
        const bLast = b.messages[b.messages.length - 1]?.createdAt?.getTime() || 0;
        return bLast - aLast;
      });
  }

  async getSupportConversationStatus(userId: number): Promise<{ isClosed: boolean; closedAt: Date | null }> {
    const [conversation] = await db.select({
      isClosed: supportConversations.isClosed,
      closedAt: supportConversations.closedAt,
    })
      .from(supportConversations)
      .where(eq(supportConversations.userId, userId));

    return {
      isClosed: conversation?.isClosed ?? false,
      closedAt: conversation?.closedAt ?? null,
    };
  }

  async setSupportConversationClosed(userId: number, isClosed: boolean, adminId: number): Promise<SupportConversation> {
    const [conversation] = await db.insert(supportConversations)
      .values({
        userId,
        isClosed,
        closedAt: isClosed ? new Date() : null,
        closedBy: isClosed ? adminId : null,
      })
      .onConflictDoUpdate({
        target: supportConversations.userId,
        set: {
          isClosed,
          closedAt: isClosed ? new Date() : null,
          closedBy: isClosed ? adminId : null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return conversation;
  }

  async reopenSupportConversation(userId: number): Promise<SupportConversation> {
    const now = new Date();
    const [conversation] = await db.insert(supportConversations)
      .values({
        userId,
        isClosed: false,
        closedAt: null,
        closedBy: null,
      })
      .onConflictDoUpdate({
        target: supportConversations.userId,
        set: {
          isClosed: false,
          closedAt: null,
          closedBy: null,
          updatedAt: now,
        },
      })
      .returning();
    return conversation;
  }

  async createWithdrawalSupportRequest(data: {
    userId: number;
    amount: number;
    requestMessage: string;
    automaticReply: string;
  }): Promise<{ requestMessage: SupportMessage; automaticReply: SupportMessage }> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [user] = await tx.select({ balance: users.balance })
        .from(users)
        .where(eq(users.id, data.userId))
        .for("update");
      if (!user) throw new Error("Utilisateur introuvable");
      if (parseFloat(user.balance) < data.amount) {
        throw new Error("Solde insuffisant pour effectuer ce retrait");
      }

      await tx.update(users)
        .set({ balance: sql`${users.balance} - ${data.amount}` })
        .where(eq(users.id, data.userId));
      await tx.insert(transactions).values({
        userId: data.userId,
        type: "withdrawal",
        amount: (-data.amount).toFixed(2),
        description: "Retrait soumis via le Chat interne",
      });

      await tx.insert(supportConversations)
        .values({
          userId: data.userId,
          isClosed: false,
          closedAt: null,
          closedBy: null,
        })
        .onConflictDoUpdate({
          target: supportConversations.userId,
          set: {
            isClosed: false,
            closedAt: null,
            closedBy: null,
            updatedAt: now,
          },
        });

      const [requestMessage] = await tx.insert(supportMessages)
        .values({
          userId: data.userId,
          senderRole: "user",
          message: data.requestMessage,
          attachmentName: null,
          attachmentMimeType: null,
          attachmentData: null,
        })
        .returning();
      const [automaticReply] = await tx.insert(supportMessages)
        .values({
          userId: data.userId,
          senderRole: "admin",
          message: data.automaticReply,
          attachmentName: null,
          attachmentMimeType: null,
          attachmentData: null,
        })
        .returning();

      return { requestMessage, automaticReply };
    });
  }

  async finishWithdrawalConversation(data: {
    userId: number;
    adminId: number;
    automaticReply: string;
  }): Promise<{ automaticReply: SupportMessage; conversation: SupportConversation }> {
    return db.transaction(async (tx) => {
      const [request] = await tx.select({ id: supportMessages.id })
        .from(supportMessages)
        .where(and(
          eq(supportMessages.userId, data.userId),
          eq(supportMessages.senderRole, "user"),
          sql`${supportMessages.message} LIKE ${"%Numéro de retrait :%"}`,
        ))
        .limit(1);
      if (!request) throw new Error("Aucune demande de retrait trouvée");
      const [existingConversation] = await tx.select({ isClosed: supportConversations.isClosed })
        .from(supportConversations)
        .where(eq(supportConversations.userId, data.userId))
        .limit(1);
      if (existingConversation?.isClosed) {
        throw new Error("Cette demande de retrait est déjà terminée");
      }

      const [automaticReply] = await tx.insert(supportMessages).values({
        userId: data.userId,
        senderRole: "admin",
        message: data.automaticReply,
        attachmentName: null,
        attachmentMimeType: null,
        attachmentData: null,
      }).returning();
      const [conversation] = await tx.insert(supportConversations)
        .values({
          userId: data.userId,
          isClosed: true,
          closedAt: new Date(),
          closedBy: data.adminId,
        })
        .onConflictDoUpdate({
          target: supportConversations.userId,
          set: {
            isClosed: true,
            closedAt: new Date(),
            closedBy: data.adminId,
            updatedAt: new Date(),
          },
        })
        .returning();

      return { automaticReply, conversation };
    });
  }

  async markSupportConversationRead(userId: number): Promise<SupportConversation | undefined> {
    const readAt = new Date();
    const [conversation] = await db.insert(supportConversations)
      .values({
        userId,
        adminReadAt: readAt,
      })
      .onConflictDoUpdate({
        target: supportConversations.userId,
        set: {
          adminReadAt: readAt,
          updatedAt: readAt,
        },
      })
      .returning();
    return conversation;
  }

  async createSupportMessage(data: InsertSupportMessage): Promise<SupportMessage> {
    const [message] = await db.insert(supportMessages).values(data).returning();
    return message;
  }

  async updateSupportMessage(id: number, message: string, adminId: number): Promise<SupportMessage | undefined> {
    return db.transaction(async (tx) => {
      const [currentMessage] = await tx.select()
        .from(supportMessages)
        .where(and(
          eq(supportMessages.id, id),
          eq(supportMessages.senderRole, "admin"),
        ))
        .for("update");

      if (!currentMessage) return undefined;

      const editedAt = new Date();
      const [editor] = await tx.select({ fullName: users.fullName })
        .from(users)
        .where(eq(users.id, adminId));
      await tx.insert(supportMessageEditAudit).values({
        messageId: id,
        previousMessage: currentMessage.message,
        editedBy: adminId,
        editedByName: editor?.fullName ?? null,
        editedAt,
      });

      const [updatedMessage] = await tx.update(supportMessages)
        .set({
          message,
          editedBy: adminId,
          editedByName: editor?.fullName ?? null,
          editedAt,
        })
        .where(eq(supportMessages.id, id))
        .returning();
      return updatedMessage;
    });
  }

  async getSupportMessageEditHistory(messageId: number): Promise<SupportMessageEditAuditWithEditor[]> {
    return db.select({
      id: supportMessageEditAudit.id,
      messageId: supportMessageEditAudit.messageId,
      previousMessage: supportMessageEditAudit.previousMessage,
      editedBy: supportMessageEditAudit.editedBy,
      editedByName: supportMessageEditAudit.editedByName,
      editedAt: supportMessageEditAudit.editedAt,
    })
      .from(supportMessageEditAudit)
      .where(eq(supportMessageEditAudit.messageId, messageId))
      .orderBy(desc(supportMessageEditAudit.editedAt), desc(supportMessageEditAudit.id));
  }

  // Transactions
  async createTransaction(data: Partial<Transaction>): Promise<Transaction> {
    const [transaction] = await db.insert(transactions).values(data as any).returning();
    return transaction;
  }

  async getUserTransactions(userId: number): Promise<Transaction[]> {
    return await db.select().from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt));
  }

  // Settings
  async getSetting(key: string): Promise<string | null> {
    const [setting] = await db.select().from(platformSettings).where(eq(platformSettings.key, key));
    return setting?.value || null;
  }

  async getSettings(): Promise<Record<string, string>> {
    const allSettings = await db.select().from(platformSettings);
    const result: Record<string, string> = {};
    for (const s of allSettings) {
      result[s.key] = s.value;
    }
    return result;
  }

  async setSetting(key: string, value: string, modifiedBy?: number): Promise<void> {
    const existing = await db.select().from(platformSettings).where(eq(platformSettings.key, key));
    if (existing.length > 0) {
      await db.update(platformSettings).set({ value, modifiedBy, modifiedAt: new Date() }).where(eq(platformSettings.key, key));
    } else {
      await db.insert(platformSettings).values({ key, value, modifiedBy, modifiedAt: new Date() });
    }
  }

  // Admin
  async getStats(startDate?: Date, endDate?: Date): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get the statistics reset date
    const statsResetDateStr = await this.getSetting("statsResetDate");
    const statsResetDate = statsResetDateStr ? new Date(statsResetDateStr) : new Date(0);
    
    const filterStart = startDate || new Date(0);
    const filterEnd = endDate || new Date();
    filterEnd.setHours(23, 59, 59, 999);

    const [totalUsersResult] = await db.select({ count: sql<number>`count(*)` }).from(users).where(gte(users.createdAt, statsResetDate));
    const [todayUsersResult] = await db.select({ count: sql<number>`count(*)` }).from(users).where(gte(users.createdAt, today));
    const [periodUsersResult] = await db.select({ count: sql<number>`count(*)` }).from(users)
      .where(and(gte(users.createdAt, filterStart), lte(users.createdAt, filterEnd)));
    
    const [totalDepositsResult] = await db.select({ total: sql<string>`COALESCE(SUM(${deposits.amount}), 0)` })
      .from(deposits).where(and(eq(deposits.status, "approved"), gte(deposits.createdAt, statsResetDate)));
    const [todayDepositsResult] = await db.select({ total: sql<string>`COALESCE(SUM(${deposits.amount}), 0)` })
      .from(deposits).where(and(eq(deposits.status, "approved"), gte(deposits.createdAt, today)));
    const [periodDepositsResult] = await db.select({ total: sql<string>`COALESCE(SUM(${deposits.amount}), 0)` })
      .from(deposits).where(and(eq(deposits.status, "approved"), gte(deposits.createdAt, filterStart), lte(deposits.createdAt, filterEnd)));
    const [pendingDepositsResult] = await db.select({ total: sql<string>`COALESCE(SUM(${deposits.amount}), 0)`, count: sql<number>`count(*)` })
      .from(deposits).where(eq(deposits.status, "pending"));
    
    const [totalWithdrawalsResult] = await db.select({ total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)` })
      .from(withdrawals).where(and(eq(withdrawals.status, "approved"), gte(withdrawals.createdAt, statsResetDate)));
    const [todayWithdrawalsResult] = await db.select({ total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)` })
      .from(withdrawals).where(and(eq(withdrawals.status, "approved"), gte(withdrawals.createdAt, today)));
    const [periodWithdrawalsResult] = await db.select({ total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)` })
      .from(withdrawals).where(and(eq(withdrawals.status, "approved"), gte(withdrawals.createdAt, filterStart), lte(withdrawals.createdAt, filterEnd)));
    const [pendingWithdrawalsResult] = await db.select({ total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)`, count: sql<number>`count(*)` })
      .from(withdrawals).where(eq(withdrawals.status, "pending"));
    
    const [usersWithProductsResult] = await db.select({ count: sql<number>`count(DISTINCT ${userProducts.userId})` })
      .from(userProducts).where(and(eq(userProducts.isActive, true), gte(userProducts.purchaseDate, statsResetDate)));
    
    // Get baseline values for cumulative counters
    const baselineBalance = parseFloat(await this.getSetting("baselineTotalBalance") || "0");
    const baselineEarnings = parseFloat(await this.getSetting("baselineTotalEarnings") || "0");
    const baselineCommissions = parseFloat(await this.getSetting("baselineTotalCommissions") || "0");
    
    const [totalBalanceResult] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(${users.balance} AS DECIMAL)), 0)` })
      .from(users);
    
    const [totalEarningsResult] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(${users.totalEarnings} AS DECIMAL)), 0)` })
      .from(users);
    
    const [totalProductsResult] = await db.select({ count: sql<number>`count(*)` })
      .from(userProducts).where(and(eq(userProducts.isActive, true), gte(userProducts.purchaseDate, statsResetDate)));
    
    const [totalCommissionsResult] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` })
      .from(transactions).where(eq(transactions.type, "commission"));

    // Subtract baseline values to get statistics since the reset
    const adjustedBalance = Math.max(0, parseFloat(totalBalanceResult?.total || "0") - baselineBalance);
    const adjustedEarnings = Math.max(0, parseFloat(totalEarningsResult?.total || "0") - baselineEarnings);
    const adjustedCommissions = Math.max(0, parseFloat(totalCommissionsResult?.total || "0") - baselineCommissions);

    return {
      totalUsers: totalUsersResult?.count || 0,
      todayUsers: todayUsersResult?.count || 0,
      periodUsers: periodUsersResult?.count || 0,
      totalDeposits: parseFloat(totalDepositsResult?.total || "0"),
      todayDeposits: parseFloat(todayDepositsResult?.total || "0"),
      periodDeposits: parseFloat(periodDepositsResult?.total || "0"),
      pendingDeposits: parseFloat(pendingDepositsResult?.total || "0"),
      pendingDepositsCount: pendingDepositsResult?.count || 0,
      totalWithdrawals: parseFloat(totalWithdrawalsResult?.total || "0"),
      todayWithdrawals: parseFloat(todayWithdrawalsResult?.total || "0"),
      periodWithdrawals: parseFloat(periodWithdrawalsResult?.total || "0"),
      pendingWithdrawals: parseFloat(pendingWithdrawalsResult?.total || "0"),
      pendingWithdrawalsCount: pendingWithdrawalsResult?.count || 0,
      usersWithProducts: usersWithProductsResult?.count || 0,
      totalBalance: adjustedBalance,
      totalEarnings: adjustedEarnings,
      totalActiveProducts: totalProductsResult?.count || 0,
      totalCommissions: adjustedCommissions,
    };
  }

  async logAdminAction(adminId: number, action: string, targetUserId: number | null, details: string): Promise<void> {
    await db.insert(adminAuditLog).values({ adminId, action, targetUserId, details });
  }

  async resetStats(): Promise<void> {
    // Store the reset date - statistics only count data after this date
    await this.setSetting("statsResetDate", new Date().toISOString());
    
    // Store baseline values for cumulative counters (balance and earnings)
    const [currentBalance] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(${users.balance} AS DECIMAL)), 0)` }).from(users);
    const [currentEarnings] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(${users.totalEarnings} AS DECIMAL)), 0)` }).from(users);
    const [currentCommissions] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` }).from(transactions).where(eq(transactions.type, "commission"));
    
    await this.setSetting("baselineTotalBalance", currentBalance?.total || "0");
    await this.setSetting("baselineTotalEarnings", currentEarnings?.total || "0");
    await this.setSetting("baselineTotalCommissions", currentCommissions?.total || "0");
  }

  // Gift Codes
  async getAllGiftCodes(): Promise<GiftCode[]> {
    return await db.select().from(giftCodes).orderBy(desc(giftCodes.createdAt));
  }

  async getGiftCodeByCode(code: string): Promise<GiftCode | undefined> {
    const [giftCode] = await db.select().from(giftCodes).where(
      sql`UPPER(${giftCodes.code}) = UPPER(${code})`
    );
    return giftCode || undefined;
  }

  async createGiftCode(data: { code: string; amount: string; maxUses: number; expiresAt: Date; createdBy: number }): Promise<GiftCode> {
    const [giftCode] = await db.insert(giftCodes).values(data).returning();
    return giftCode;
  }

  async deleteGiftCode(id: number): Promise<void> {
    await db.delete(giftCodes).where(eq(giftCodes.id, id));
  }

  async hasUserClaimedGiftCode(userId: number, giftCodeId: number): Promise<boolean> {
    const [claim] = await db.select().from(giftCodeClaims).where(
      and(eq(giftCodeClaims.userId, userId), eq(giftCodeClaims.giftCodeId, giftCodeId))
    );
    return !!claim;
  }

  async claimGiftCode(userId: number, giftCodeId: number, amount: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.insert(giftCodeClaims).values({ userId, giftCodeId });
      await tx.update(giftCodes).set({
        currentUses: sql`${giftCodes.currentUses} + 1`
      }).where(eq(giftCodes.id, giftCodeId));
      await tx.update(users).set({
        balance: sql`${users.balance} + ${amount}`
      }).where(eq(users.id, userId));
      await tx.insert(transactions).values({
        userId,
        type: "gift_code",
        amount: amount.toString(),
        description: `Gift code bonus`
      });
    });
  }

  // Countries
  async getCountries(): Promise<Country[]> {
    return await db.select().from(countries);
  }

  async getActiveCountries(): Promise<Country[]> {
    return await db.select().from(countries).where(eq(countries.isActive, true));
  }

  async getCountry(id: number): Promise<Country | undefined> {
    const [country] = await db.select().from(countries).where(eq(countries.id, id));
    return country || undefined;
  }

  async createCountry(data: Partial<Country>): Promise<Country> {
    const [country] = await db.insert(countries).values(data as any).returning();
    return country;
  }

  async updateCountry(id: number, data: Partial<Country>): Promise<Country> {
    const [country] = await db.update(countries).set(data as any).where(eq(countries.id, id)).returning();
    return country;
  }

  async deleteCountry(id: number): Promise<void> {
    await db.delete(countries).where(eq(countries.id, id));
  }

  // Payment Numbers
  async getPaymentNumbers(): Promise<PaymentNumber[]> {
    return await db.select().from(paymentNumbers).orderBy(desc(paymentNumbers.createdAt));
  }

  async getPaymentNumbersByCountry(country: string): Promise<PaymentNumber[]> {
    return await db.select().from(paymentNumbers)
      .where(and(eq(paymentNumbers.country, country), eq(paymentNumbers.isActive, true)))
      .orderBy(paymentNumbers.operatorName);
  }

  async createPaymentNumber(data: Partial<PaymentNumber>): Promise<PaymentNumber> {
    const [num] = await db.insert(paymentNumbers).values(data as any).returning();
    return num;
  }

  async updatePaymentNumber(id: number, data: Partial<PaymentNumber>): Promise<PaymentNumber> {
    const [num] = await db.update(paymentNumbers).set(data as any).where(eq(paymentNumbers.id, id)).returning();
    return num;
  }

  async deletePaymentNumber(id: number): Promise<void> {
    await db.delete(paymentNumbers).where(eq(paymentNumbers.id, id));
  }

  // Staking Products
  async getStakingProducts(): Promise<StakingProduct[]> {
    return await db.select().from(stakingProducts).orderBy(stakingProducts.createdAt);
  }

  async getActiveStakingProducts(): Promise<StakingProduct[]> {
    return await db.select().from(stakingProducts)
      .where(eq(stakingProducts.isActive, true))
      .orderBy(stakingProducts.launchDate);
  }

  async getStakingProduct(id: number): Promise<StakingProduct | undefined> {
    const [sp] = await db.select().from(stakingProducts).where(eq(stakingProducts.id, id));
    return sp || undefined;
  }

  async createStakingProduct(data: Partial<StakingProduct>): Promise<StakingProduct> {
    const [sp] = await db.insert(stakingProducts).values(data as any).returning();
    return sp;
  }

  async updateStakingProduct(id: number, data: Partial<StakingProduct>): Promise<StakingProduct> {
    const [sp] = await db.update(stakingProducts).set(data as any).where(eq(stakingProducts.id, id)).returning();
    return sp;
  }

  async deleteStakingProduct(id: number): Promise<void> {
    await db.delete(stakingProducts).where(eq(stakingProducts.id, id));
  }

  async purchaseStaking(userId: number, stakingProductId: number): Promise<UserStaking> {
    const sp = await this.getStakingProduct(stakingProductId);
    if (!sp) throw new Error("Staking product not found");
    if (!sp.isActive) throw new Error("Staking product is inactive");

    const now = new Date();
    if (sp.launchDate && new Date(sp.launchDate) > now) {
      throw new Error("This product is not yet available for purchase");
    }

    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");
    if (parseFloat(user.balance) < sp.price) {
      throw new Error(`Insufficient balance. You are short ${(sp.price - parseFloat(user.balance)).toLocaleString()} GPB`);
    }

    // Check user has at least one active regular product
    const activeProds = await db.select().from(userProducts)
      .where(and(eq(userProducts.userId, userId), eq(userProducts.isActive, true)));
    if (activeProds.length === 0) {
      throw new Error("You must own an active product before accessing staking");
    }

    const releaseDate = new Date(now.getTime() + sp.lockDays * 24 * 60 * 60 * 1000);

    const [staking] = await db.insert(userStakings).values({
      userId,
      stakingProductId,
      amountPaid: sp.price,
      returnAmount: sp.returnAmount,
      purchasedAt: now,
      releaseDate,
      status: "active",
    }).returning();

    // Deduct balance
    const newBalance = (parseFloat(user.balance) - sp.price).toFixed(2);
    await this.updateUser(userId, { balance: newBalance });

    await this.createTransaction({
      userId,
      type: "staking",
      amount: (-sp.price).toString(),
      description: `Staking: ${sp.name}`,
    });

    return staking;
  }

  async getUserStakings(userId: number): Promise<(UserStaking & { product: StakingProduct })[]> {
    const result = await db.select({ staking: userStakings, product: stakingProducts })
      .from(userStakings)
      .innerJoin(stakingProducts, eq(userStakings.stakingProductId, stakingProducts.id))
      .where(eq(userStakings.userId, userId))
      .orderBy(desc(userStakings.purchasedAt));
    return result.map(r => ({ ...r.staking, product: r.product }));
  }

  async getAllUserStakings(): Promise<(UserStaking & { product: StakingProduct; user: User })[]> {
    const result = await db.select({ staking: userStakings, product: stakingProducts, user: users })
      .from(userStakings)
      .innerJoin(stakingProducts, eq(userStakings.stakingProductId, stakingProducts.id))
      .innerJoin(users, eq(userStakings.userId, users.id))
      .orderBy(desc(userStakings.purchasedAt));
    return result.map(r => ({ ...r.staking, product: r.product, user: r.user }));
  }

  async releaseMaturedStakings(): Promise<void> {
    const now = new Date();
    const matured = await db.select().from(userStakings)
      .where(and(eq(userStakings.status, "active"), lte(userStakings.releaseDate, now)));

    for (const staking of matured) {
      try {
        const user = await this.getUser(staking.userId);
        if (!user) continue;
        const newBalance = (parseFloat(user.balance) + staking.returnAmount).toFixed(2);
        await this.updateUser(staking.userId, { balance: newBalance });
        await db.update(userStakings)
          .set({ status: "released", releasedAt: now })
          .where(eq(userStakings.id, staking.id));
        await this.createTransaction({
          userId: staking.userId,
          type: "staking_release",
          amount: staking.returnAmount.toString(),
          description: `Staking release #${staking.id}`,
        });
      } catch (e) {
        console.error("Error releasing staking:", staking.id, e);
      }
    }
  }
}

export const storage = new DatabaseStorage();
