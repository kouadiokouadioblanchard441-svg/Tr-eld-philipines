import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import bcrypt from "bcrypt";

const databaseConfigured = Boolean(
  (process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL) && process.env.SESSION_SECRET,
);
const TEST_IMAGE = "data:image/png;base64,AA==";

test("sends an approved withdrawal request to the internal chat", {
  skip: !databaseConfigured,
}, async () => {
  const [{ db, pool }, schema, { inArray }, { registerRoutes }] = await Promise.all([
    import("./db"),
    import("@shared/schema"),
    import("drizzle-orm"),
    import("./routes"),
  ]);
  const { identityVerifications, supportMessages, supportConversations, users } = schema;
  const uniqueKey = `${Date.now()}${process.pid}`.slice(-10);
  const password = await bcrypt.hash("test-password", 4);
  const approvedPhone = `+226${uniqueKey}`;
  const pendingPhone = `+225${uniqueKey}`;
  const referralCodes = [`WITHDRAWAPPROVED${uniqueKey}`, `WITHDRAWPENDING${uniqueKey}`];
  const [approvedUser, pendingUser] = await db.insert(users).values([
    {
      fullName: "Withdrawal approved test user",
      phone: approvedPhone,
      country: "BF",
      password,
      referralCode: referralCodes[0],
    },
    {
      fullName: "Withdrawal pending test user",
      phone: pendingPhone,
      country: "BF",
      password,
      referralCode: referralCodes[1],
    },
  ]).returning({ id: users.id });

  let integrationServer: ReturnType<typeof createServer> | undefined;

  try {
    await db.insert(identityVerifications).values([
      {
        userId: approvedUser.id,
        fullName: "Withdrawal approved test user",
        idNumber: `ID-APPROVED-${uniqueKey}`,
        idFront: TEST_IMAGE,
        idBack: TEST_IMAGE,
        selfie: TEST_IMAGE,
        status: "approved",
      },
      {
        userId: pendingUser.id,
        fullName: "Withdrawal pending test user",
        idNumber: `ID-PENDING-${uniqueKey}`,
        idFront: TEST_IMAGE,
        idBack: TEST_IMAGE,
        selfie: TEST_IMAGE,
        status: "pending",
      },
    ]);

    const app = express();
    app.use(express.json());
    integrationServer = createServer(app);
    await registerRoutes(integrationServer, app);
    integrationServer.listen(0);
    await once(integrationServer, "listening");
    const address = integrationServer.address();
    assert(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const login = async (phone: string) => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone,
          password: "test-password",
          country: "BF",
        }),
      });
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      assert(cookie);
      return cookie;
    };

    const approvedCookie = await login(approvedPhone);
    const requestResponse = await fetch(`${baseUrl}/api/support/withdrawal-request`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: approvedCookie,
      },
      body: JSON.stringify({
        phone: "+226059546345",
        amount: 2,
      }),
    });
    assert.equal(requestResponse.status, 201);
    const requestResult = await requestResponse.json();
    assert.equal(requestResult.conversionRate, 1500);
    assert.equal(requestResult.feePercent, 10);
    assert.equal(requestResult.convertedAmount, 3000);
    assert.equal(requestResult.feeAmount, 300);
    assert.equal(requestResult.netAmount, 2700);

    const messagesResponse = await fetch(`${baseUrl}/api/support/messages`, {
      headers: { cookie: approvedCookie },
    });
    assert.equal(messagesResponse.status, 200);
    const messages = await messagesResponse.json();
    assert.equal(messages.length, 2);
    assert.equal(messages[0].senderRole, "user");
    assert.match(messages[0].message, /2 GPB/);
    assert.match(messages[0].message, /Net à recevoir : 2[  ]?700 F XOF/);
    assert.equal(messages[1].senderRole, "admin");
    assert.match(messages[1].message, /demande.*marchand/i);

    const conversationResponse = await fetch(`${baseUrl}/api/support/conversation`, {
      headers: { cookie: approvedCookie },
    });
    assert.equal(conversationResponse.status, 200);
    assert.deepEqual(await conversationResponse.json(), {
      isClosed: false,
      closedAt: null,
    });

    const pendingCookie = await login(pendingPhone);
    const blockedResponse = await fetch(`${baseUrl}/api/support/withdrawal-request`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: pendingCookie,
      },
      body: JSON.stringify({
        phone: "+226059546345",
        amount: 2,
      }),
    });
    assert.equal(blockedResponse.status, 403);
    assert.match((await blockedResponse.json()).message, /approuver votre identité/i);
  } finally {
    if (integrationServer) {
      await new Promise<void>((resolve) => integrationServer!.close(() => resolve()));
    }
    const userIds = [approvedUser.id, pendingUser.id];
    await db.delete(identityVerifications).where(inArray(identityVerifications.userId, userIds));
    await db.delete(supportMessages).where(inArray(supportMessages.userId, userIds));
    await db.delete(supportConversations).where(inArray(supportConversations.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await pool.end();
  }
});