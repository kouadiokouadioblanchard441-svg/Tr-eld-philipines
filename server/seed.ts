import { db } from "./db";
import { users, tasks, paymentChannels, platformSettings, countries, stakingProducts } from "@shared/schema";
import bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";
import { migrateReferralBonusDefaults } from "./referral-bonus-migration";
import { createUserAvatar } from "./user-avatar";

async function ensureSupportSchema() {
  await db.transaction(async (tx) => {
    const hasTable = async (tableName: string) => {
      const result = await tx.execute(sql`
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = ${tableName}
      `);
      return result.rows.length > 0;
    };

    const getColumns = async (tableName: string) => {
      const result = await tx.execute(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = ${tableName}
      `);
      return new Set(result.rows.map((row) => String(row.column_name)));
    };

    // Imported databases can contain the original support_messages table
    // without the later editor columns. Only add objects/columns here; never
    // rename or replace an existing table.
    if (!(await hasTable("support_messages"))) {
      await tx.execute(sql`
        CREATE TABLE "support_messages" (
          "id" serial PRIMARY KEY NOT NULL,
          "user_id" integer NOT NULL,
          "sender_role" text NOT NULL,
          "message" text DEFAULT '' NOT NULL,
          "attachment_name" text,
          "attachment_mime_type" text,
          "attachment_data" text,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "edited_by" integer,
          "edited_by_name" text,
          "edited_at" timestamp
        )
      `);
    }

    const supportMessageColumns = await getColumns("support_messages");
    if (!supportMessageColumns.has("edited_by")) {
      await tx.execute(sql`ALTER TABLE "support_messages" ADD COLUMN "edited_by" integer`);
    }
    if (!supportMessageColumns.has("edited_by_name")) {
      await tx.execute(sql`ALTER TABLE "support_messages" ADD COLUMN "edited_by_name" text`);
    }
    if (!supportMessageColumns.has("edited_at")) {
      await tx.execute(sql`ALTER TABLE "support_messages" ADD COLUMN "edited_at" timestamp`);
    }

    if (!(await hasTable("support_message_edit_audit"))) {
      await tx.execute(sql`
        CREATE TABLE "support_message_edit_audit" (
          "id" serial PRIMARY KEY NOT NULL,
          "message_id" integer NOT NULL,
          "previous_message" text NOT NULL,
          "edited_by" integer,
          "edited_by_name" text,
          "edited_at" timestamp DEFAULT now() NOT NULL
        )
      `);
    } else {
      const auditColumns = await getColumns("support_message_edit_audit");
      if (!auditColumns.has("edited_by_name")) {
        await tx.execute(sql`ALTER TABLE "support_message_edit_audit" ADD COLUMN "edited_by_name" text`);
      }
    }

    if (!(await hasTable("support_conversations"))) {
      await tx.execute(sql`
        CREATE TABLE "support_conversations" (
          "id" serial PRIMARY KEY NOT NULL,
          "user_id" integer NOT NULL UNIQUE,
          "is_closed" boolean NOT NULL DEFAULT false,
          "closed_at" timestamp,
          "closed_by" integer,
          "admin_read_at" timestamp,
          "updated_at" timestamp NOT NULL DEFAULT now()
        )
      `);
    }

    const conversationColumns = await getColumns("support_conversations");
    if (!conversationColumns.has("admin_read_at")) {
      await tx.execute(sql`ALTER TABLE "support_conversations" ADD COLUMN "admin_read_at" timestamp`);
    }

    await tx.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "support_messages"
          ADD CONSTRAINT "support_messages_user_id_users_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await tx.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "support_messages"
          ADD CONSTRAINT "support_messages_edited_by_users_id_fk"
          FOREIGN KEY ("edited_by") REFERENCES "users"("id")
          ON DELETE set null ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await tx.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "support_message_edit_audit"
          ADD CONSTRAINT "support_message_edit_audit_message_id_support_messages_id_fk"
          FOREIGN KEY ("message_id") REFERENCES "support_messages"("id")
          ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await tx.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "support_message_edit_audit"
          ADD CONSTRAINT "support_message_edit_audit_edited_by_users_id_fk"
          FOREIGN KEY ("edited_by") REFERENCES "users"("id")
          ON DELETE set null ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await tx.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "support_conversations"
          ADD CONSTRAINT "support_conversations_user_id_users_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await tx.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "support_conversations"
          ADD CONSTRAINT "support_conversations_closed_by_users_id_fk"
          FOREIGN KEY ("closed_by") REFERENCES "users"("id")
          ON DELETE set null ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await tx.execute(sql`
      CREATE INDEX IF NOT EXISTS "support_message_edit_audit_message_id_idx"
        ON "support_message_edit_audit" ("message_id")
    `);

    // Preserve the historical editor name even if the referenced user is
    // subsequently renamed or deleted.
    await tx.execute(sql`
      UPDATE "support_messages" AS message
      SET "edited_by_name" = editor."full_name"
      FROM "users" AS editor
      WHERE message."edited_by" = editor."id"
        AND message."edited_by_name" IS NULL
    `);
    await tx.execute(sql`
      UPDATE "support_message_edit_audit" AS audit
      SET "edited_by_name" = editor."full_name"
      FROM "users" AS editor
      WHERE audit."edited_by" = editor."id"
        AND audit."edited_by_name" IS NULL
    `);
  });
}

async function ensureUserAvatarSchema() {
  await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text`);

  const existingUsers = await db.select({
    id: users.id,
    fullName: users.fullName,
    phone: users.phone,
    avatarUrl: users.avatarUrl,
  }).from(users);

  for (const user of existingUsers) {
    if (!user.avatarUrl || !user.avatarUrl.startsWith("/avatars/")) {
      await db.update(users)
        .set({ avatarUrl: createUserAvatar(`${user.id}:${user.phone}:${user.fullName}`) })
        .where(eq(users.id, user.id));
    }
  }
}

export async function seed() {
  console.log("Seeding database...");

  // Create session table for connect-pg-simple (if not exists)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
  `);

  await ensureSupportSchema();
  await ensureUserAvatarSchema();

  // News counters are administrator-controlled display totals. Existing
  // installations are initialized from their real interaction records once.
  const likesCounterColumn = await db.execute(sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'news_posts' AND column_name = 'likes_count'
  `);
  if (likesCounterColumn.rows.length === 0) {
    await db.execute(sql`ALTER TABLE "news_posts" ADD COLUMN "likes_count" integer NOT NULL DEFAULT 0`);
    await db.execute(sql`
      UPDATE "news_posts" posts
      SET "likes_count" = (
        SELECT COUNT(*)::int FROM "news_likes" likes WHERE likes."post_id" = posts."id"
      )
    `);
  }

  const viewsCounterColumn = await db.execute(sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'news_posts' AND column_name = 'views_count'
  `);
  if (viewsCounterColumn.rows.length === 0) {
    await db.execute(sql`ALTER TABLE "news_posts" ADD COLUMN "views_count" integer NOT NULL DEFAULT 0`);
    await db.execute(sql`
      UPDATE "news_posts" posts
      SET "views_count" = (
        SELECT COUNT(*)::int FROM "news_views" views WHERE views."post_id" = posts."id"
      )
    `);
  }

  // Ensure countries table exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "countries" (
      "id" serial PRIMARY KEY,
      "code" text NOT NULL UNIQUE,
      "name" text NOT NULL,
      "currency" text NOT NULL,
      "phone_prefix" text NOT NULL,
      "operators" text NOT NULL DEFAULT '[]',
      "is_active" boolean NOT NULL DEFAULT true
    )
  `);

  // Check if admin already exists. Keep a development fallback for existing
  // installations, while allowing deployments to configure the admin phone
  // through the secret store.
  const adminPhone = process.env.ADMIN_PHONE || "99935673";
  const existingAdmin = await db.select().from(users).where(eq(users.phone, adminPhone));
  const adminPassword = process.env.ADMIN_PASSWORD;

  const adminPin = process.env.ADMIN_PIN;

  if (existingAdmin.length === 0) {
    if (!adminPassword) {
      console.warn("No administrator exists yet; set ADMIN_PASSWORD to provision the initial admin.");
    } else {
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      await db.insert(users).values({
        fullName: "Super Admin",
        phone: adminPhone,
        country: "TG",
        password: hashedPassword,
        avatarUrl: createUserAvatar(`${adminPhone}:Super Admin:ADMIN1`),
        referralCode: "ADMIN1",
        balance: "0",
        isAdmin: true,
        isSuperAdmin: true,
        adminPin: adminPin || null,
      });
      console.log("Super admin created");
      if (adminPin) console.log("Super admin PIN configured");
    }
  } else {
    // Always update admin flags; also update password and PIN if env vars are set
    const updateData: any = {
      isAdmin: true,
      isSuperAdmin: true,
      // Keep the bootstrap administrator able to use an active login country
      // after legacy countries are retired.
      ...(existingAdmin[0].country === "CD" ? { country: "TG" } : {}),
    };
    if (adminPassword) {
      updateData.password = await bcrypt.hash(adminPassword, 12);
      console.log("Super admin password updated");
    }
    if (adminPin) {
      updateData.adminPin = adminPin;
      console.log("Super admin PIN updated");
    }
    await db.update(users)
      .set(updateData)
      .where(eq(users.phone, adminPhone));
    console.log("Super admin access verified");
  }

  await migrateReferralBonusDefaults();

  // Canonical user-facing countries. Existing rows retain administrator-managed
  // operators; only newly created rows receive bootstrap operators.
  const canonicalCountries = [
    { code: "TG", name: "Togo", currency: "XOF", phonePrefix: "228", operators: ["T-Money", "Moov Money"] },
    { code: "BJ", name: "Benin", currency: "XOF", phonePrefix: "229", operators: ["MTN", "Moov Money"] },
    { code: "BF", name: "Burkina Faso", currency: "XOF", phonePrefix: "226", operators: ["Orange Money", "Moov Money"] },
    { code: "CI", name: "Ivory Coast", currency: "XOF", phonePrefix: "225", operators: ["Orange Money", "MTN", "Moov Money", "Wave"] },
    { code: "CM", name: "Cameroon", currency: "XAF", phonePrefix: "237", operators: ["MTN", "Orange Money"] },
  ];
  const existingCountries = await db.select().from(countries);
  for (const country of canonicalCountries) {
    const existing = existingCountries.find((item) => item.code === country.code);
    if (existing) {
      await db.update(countries).set({
        name: country.name, currency: country.currency, phonePrefix: country.phonePrefix,
      }).where(eq(countries.id, existing.id));
    } else {
      await db.insert(countries).values({ ...country, operators: JSON.stringify(country.operators), isActive: true });
    }
  }
  await db.update(countries).set({ isActive: false })
    .where(sql`${countries.code} NOT IN ('TG', 'BJ', 'BF', 'CI', 'CM')`);

  // Seed tasks only if table is empty (first install only — never overwrite admin changes)
  const existingTasks = await db.select().from(tasks);
  const legacyTaskTranslations = new Map([
    ["Parrain Bronze", { name: "Bronze referral", description: "Invite 3 people to invest" }],
    ["Parrain Argent", { name: "Silver referral", description: "Invite 5 people to invest" }],
    ["Parrain Or", { name: "Gold referral", description: "Invite 10 people to invest" }],
    ["Parrain Platine", { name: "Platinum referral", description: "Invite 30 people to invest" }],
    ["Parrain Diamant", { name: "Diamond referral", description: "Invite 100 people to invest" }],
    ["Parrain Elite", { name: "Elite referral", description: "Invite 300 people to invest" }],
  ]);
  for (const task of existingTasks) {
    const translation = legacyTaskTranslations.get(task.name);
    if (translation) {
      await db.update(tasks).set(translation).where(eq(tasks.id, task.id));
      console.log(`Task translated: ${task.name} → ${translation.name}`);
    }
  }
  if (existingTasks.length === 0) {
    await db.insert(tasks).values([
      { name: "Bronze referral", description: "Invite 3 people to invest", requiredInvites: 3, reward: 1428, sortOrder: 1 },
      { name: "Silver referral", description: "Invite 5 people to invest", requiredInvites: 5, reward: 3060, sortOrder: 2 },
      { name: "Gold referral", description: "Invite 10 people to invest", requiredInvites: 10, reward: 10200, sortOrder: 3 },
      { name: "Platinum referral", description: "Invite 30 people to invest", requiredInvites: 30, reward: 26520, sortOrder: 4 },
      { name: "Diamond referral", description: "Invite 100 people to invest", requiredInvites: 100, reward: 61200, sortOrder: 5 },
      { name: "Elite referral", description: "Invite 300 people to invest", requiredInvites: 300, reward: 204000, sortOrder: 6 },
    ]);
    console.log("Tasks seeded (first install)");
  } else {
    console.log(`Tasks skipped — ${existingTasks.length} existing tasks preserved`);
  }

  // Check if payment channels exist
  const existingChannels = await db.select().from(paymentChannels);
  if (existingChannels.length === 0) {
    await db.insert(paymentChannels).values([
      { name: "LeekPay", redirectUrl: "https://leekpay.com/pay", isApi: false },
      { name: "FedaPay", redirectUrl: "https://fedapay.com/payment", isApi: false },
    ]);
    console.log("Payment channels seeded");
  }

  // Check if settings exist - apply new values for new keys or update existing
  const existingSettings = await db.select().from(platformSettings);
  const requiredSettings = [
    { key: "supportLink", value: "https://t.me/sybotx" },
    { key: "supportType", value: "telegram" },
    { key: "supportLabel", value: "Customer service" },
    { key: "support2Link", value: "https://t.me/sybotx" },
    { key: "support2Type", value: "telegram" },
    { key: "support2Label", value: "Customer service 2" },
    { key: "channelLink", value: "https://t.me/sybotx" },
    { key: "channelType", value: "telegram" },
    { key: "channelLabel", value: "Official channel" },
    { key: "groupLink", value: "https://t.me/sybotx" },
    { key: "groupType", value: "telegram" },
    { key: "groupLabel", value: "Discussion group" },
    { key: "popupButtonLabel", value: "Click here to join the Telegram group" },
    { key: "noticeText", value: "HSBC is a leading company with one of the country's largest networks of connected charging stations." },
    { key: "supportEnabled", value: "true" },
    { key: "support2Enabled", value: "true" },
    { key: "channelEnabled", value: "true" },
    { key: "groupEnabled", value: "true" },
    { key: "minDeposit", value: "12240" },
    { key: "minWithdrawal", value: "6120" },
    { key: "withdrawalFees", value: "18" },
    { key: "withdrawalStartHour", value: "9" },
    { key: "withdrawalEndHour", value: "17" },
    { key: "maxWithdrawalsPerDay", value: "1" },
    { key: "level1Commission", value: "20" },
    { key: "level2Commission", value: "5" },
    { key: "level3Commission", value: "2" },
    { key: "signupBonus", value: "2040" },
    { key: "soleaspayEnabled", value: "false" },
    { key: "soleaspayCountries", value: "" },
    { key: "soleaspayChannelName", value: "Westpay" },
    { key: "omnipayEnabled", value: "false" },
    { key: "omnipayChannelName", value: "OmniPay" },
    { key: "omnipayCallbackKey", value: "" },
    { key: "sendavapayEnabled", value: "false" },
    { key: "sendavapayChannelName", value: "SendavaPay" },
    { key: "sendavapayWebhookSecret", value: "" },
    { key: "westpayEnabled", value: "false" },
    { key: "westpayChannelName", value: "WestPay" },
    { key: "westpayCountries", value: "" },
    { key: "westpayWebhookSecret", value: "" },
    { key: "ashtechEnabled", value: "false" },
    { key: "ashtechChannelName", value: "AshtechPay" },
    { key: "ashtechCountries", value: "" },
    { key: "ashtechWebhookSecret", value: "" },
  ];
  const legacySettingTranslations: Record<string, string> = {
    supportLabel: "Service client",
    support2Label: "Service client 2",
    channelLabel: "Chaîne officielle",
    groupLabel: "Groupe de discussion",
    popupButtonLabel: "Cliquez ici pour rejoindre le groupe Telegram",
    noticeText: "HSBC est un leader incontournable qui possède l'un des plus grands réseaux de bornes connectées à travers le pays.",
  };

  for (const settingData of requiredSettings) {
    const existing = existingSettings.find(s => s.key === settingData.key);
    const isSensitive = /secret|key|token|password/i.test(settingData.key);
    if (!existing) {
      await db.insert(platformSettings).values(settingData);
      console.log(`Setting added: ${settingData.key}${isSensitive ? "" : ` = ${settingData.value}`}`);
    } else if (legacySettingTranslations[existing.key] === existing.value) {
      await db.update(platformSettings)
        .set({ value: settingData.value })
        .where(eq(platformSettings.key, settingData.key));
      console.log(`Setting translated: ${settingData.key} = ${settingData.value}`);
    } else if (
      settingData.key === "noticeText" &&
      /teld|tcharging|stone by ton|sybotx|disney|walt|pixar|marvel|star wars/i.test(existing.value)
    ) {
      await db.update(platformSettings)
        .set({ value: settingData.value })
        .where(eq(platformSettings.key, settingData.key));
      console.log(`Setting updated: ${settingData.key} = ${settingData.value}`);
    } else {
      console.log(`Setting preserved: ${existing.key}${isSensitive ? "" : ` = ${existing.value}`}`);
    }
  }
  console.log("Settings check complete");

  // Seed staking products only if table is empty (first install only — never overwrite admin changes)
  const existingStakingProducts = await db.select().from(stakingProducts);
  if (existingStakingProducts.length === 0) {
    await db.insert(stakingProducts).values([
      { name: "Product 1", description: "5% per day for 3 days. Capital recoverable at the end.", price: 8160, returnAmount: 9384, lockDays: 3, isActive: true },
      { name: "Product 2", description: "5% per day for 7 days. Capital recoverable at the end.", price: 20400, returnAmount: 27540, lockDays: 7, isActive: true },
      { name: "Product 3", description: "5% per day for 12 days. Capital recoverable at the end.", price: 40800, returnAmount: 65280, lockDays: 12, isActive: true },
      { name: "Product 4", description: "5% per day for 16 days. Capital recoverable at the end.", price: 81600, returnAmount: 146880, lockDays: 16, isActive: true },
      { name: "Product 5", description: "5% per day for 20 days. Capital recoverable at the end.", price: 204000, returnAmount: 408000, lockDays: 20, isActive: true },
    ]);
    console.log("Staking products seeded (first install)");
  } else {
    console.log(`Staking products skipped — ${existingStakingProducts.length} existing staking products preserved`);
  }

  console.log("Database seeding complete!");
}
