import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import bcrypt from "bcrypt";

const databaseConfigured = Boolean(
  process.env.DATABASE_URL && process.env.SESSION_SECRET,
);
const TEST_IMAGE = "data:image/png;base64,AA==";

test("sends an approved withdrawal request to the internal chat", {
  skip: !databaseConfigured,
}, async () => {
  const [{ db, pool }, schema, { eq, inArray }, { registerRoutes }, { DatabaseStorage }] = await Promise.all([
    import("./db"),
    import("@shared/schema"),
    import("drizzle-orm"),
    import("./routes"),
    import("./storage"),
  ]);
  const { identityVerifications, supportMessages, supportConversations, transactions, withdrawals, users, platformSettings } = schema;
  const uniqueKey = `${Date.now()}${process.pid}`.slice(-10);
  const password = await bcrypt.hash("test-password", 4);
  const approvedPhone = uniqueKey.slice(-8);
  const pendingPhone = approvedPhone.startsWith("9")
    ? `8${approvedPhone.slice(1)}`
    : `9${approvedPhone.slice(1)}`;
  const referralCodes = [`WITHDRAWAPPROVED${uniqueKey}`, `WITHDRAWPENDING${uniqueKey}`];
  const [approvedUser, pendingUser] = await db.insert(users).values([
    {
      fullName: "Withdrawal approved test user",
      phone: approvedPhone,
      country: "BF",
      password,
      referralCode: referralCodes[0],
      balance: "20000",
      earningsBalance: "20000",
      hasActiveProduct: true,
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
    const initialStatusResponse = await fetch(`${baseUrl}/api/support/withdrawal-request/status`, {
      headers: { cookie: approvedCookie },
    });
    assert.equal(initialStatusResponse.status, 200);
    assert.deepEqual(await initialStatusResponse.json(), { hasRequest: false });

    const requestResponse = await fetch(`${baseUrl}/api/support/withdrawal-request`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: approvedCookie,
      },
      body: JSON.stringify({
        phone: "+226059546345",
        amount: 7000,
      }),
    });
    assert.equal(requestResponse.status, 201);
    const requestResult = await requestResponse.json();
    assert.equal(requestResult.conversionRate, 1500);
    const configuredFee = Number((await db.select().from(platformSettings)).find((setting) => setting.key === "withdrawalFees")?.value);
    assert.equal(requestResult.feePercent, configuredFee);
    assert.equal(requestResult.convertedAmount, 10500000);
    const expectedFee = Math.round(requestResult.convertedAmount * configuredFee / 100);
    assert.equal(requestResult.feeAmount, expectedFee);
    assert.equal(requestResult.netAmount, requestResult.convertedAmount - expectedFee);
    assert.equal(requestResult.withdrawal.status, "pending");
    assert.equal(requestResult.withdrawal.amount, 7000);
    const debitedUser = (await db.select({
      balance: users.balance,
      earningsBalance: users.earningsBalance,
    }).from(users).where(eq(users.id, approvedUser.id)))[0];
    assert.equal(debitedUser?.balance, "13000.00");
    assert.equal(debitedUser?.earningsBalance, "13000.00");
    assert.equal(requestResult.withdrawal.accountNumber, "+226059546345");

    const withdrawalHistoryResponse = await fetch(`${baseUrl}/api/withdrawals/history`, {
      headers: { cookie: approvedCookie },
    });
    assert.equal(withdrawalHistoryResponse.status, 200);
    const withdrawalHistory = await withdrawalHistoryResponse.json();
    assert.equal(withdrawalHistory.length, 1);
    assert.equal(withdrawalHistory[0].status, "pending");
    assert.equal(withdrawalHistory[0].amount, 7000);

    const requestStatusResponse = await fetch(`${baseUrl}/api/support/withdrawal-request/status`, {
      headers: { cookie: approvedCookie },
    });
    assert.equal(requestStatusResponse.status, 200);
    assert.deepEqual(await requestStatusResponse.json(), { hasRequest: true });

    const messagesResponse = await fetch(`${baseUrl}/api/support/messages`, {
      headers: { cookie: approvedCookie },
    });
    assert.equal(messagesResponse.status, 200);
    const messages = await messagesResponse.json();
    assert.equal(messages.length, 2);
    assert.equal(messages[0].senderRole, "user");
    assert.match(messages[0].message, /7\s*000 GPB/u);
    const normalizedMessage = messages[0].message.replace(/\s/gu, " ");
    const expectedNetLabel = requestResult.netAmount.toLocaleString("fr-FR").replace(/\s/gu, " ");
    assert.match(normalizedMessage, new RegExp(`Net à recevoir : ${expectedNetLabel} F XOF`, "u"));
    assert.equal(messages[1].senderRole, "admin");
    assert.match(messages[1].message, /demande.*marchand/i);

    const storage = new DatabaseStorage();
    await storage.finishWithdrawalConversation({
      userId: approvedUser.id,
      adminId: approvedUser.id,
      automaticReply: "Votre retrait a été validé et effectué.",
    });
    await storage.updateWithdrawal(requestResult.withdrawal.id, {
      status: "approved",
      processedAt: new Date(),
      processedBy: approvedUser.id,
    });
    const closedMessages = await storage.getSupportMessages(approvedUser.id);
    assert.match(closedMessages.at(-1)?.message || "", /Échange terminé/u);
    const userMessagesResponse = await fetch(`${baseUrl}/api/support/messages`, {
      headers: { cookie: approvedCookie },
    });
    assert.equal(userMessagesResponse.status, 200);
    const userMessages = await userMessagesResponse.json() as Array<{ message: string }>;
    assert.match(userMessages.at(-1)?.message || "", /Échange terminé/u);
    const closedStatusResponse = await fetch(`${baseUrl}/api/support/withdrawal-request/status`, {
      headers: { cookie: approvedCookie },
    });
    assert.equal(closedStatusResponse.status, 200);
    assert.deepEqual(await closedStatusResponse.json(), { hasRequest: false });
    const reopenResponse = await fetch(`${baseUrl}/api/support/conversation/reopen`, {
      method: "POST",
      headers: { cookie: approvedCookie },
    });
    assert.equal(reopenResponse.status, 403);

    await db.update(withdrawals)
      .set({ createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
      .where(eq(withdrawals.id, requestResult.withdrawal.id));
    const nextDayRequestResponse = await fetch(`${baseUrl}/api/support/withdrawal-request`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: approvedCookie,
      },
      body: JSON.stringify({
        phone: "+226059546345",
        amount: 7000,
      }),
    });
    assert.equal(nextDayRequestResponse.status, 201);

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

    const blockedChatResponse = await fetch(`${baseUrl}/api/support/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: pendingCookie,
      },
      body: JSON.stringify({ message: "Message direct sans retrait" }),
    });
    assert.equal(blockedChatResponse.status, 403);
  } finally {
    if (integrationServer) {
      await new Promise<void>((resolve) => integrationServer!.close(() => resolve()));
    }
    const userIds = [approvedUser.id, pendingUser.id];
    await db.delete(identityVerifications).where(inArray(identityVerifications.userId, userIds));
    await db.delete(supportMessages).where(inArray(supportMessages.userId, userIds));
    await db.delete(supportConversations).where(inArray(supportConversations.userId, userIds));
    await db.delete(transactions).where(inArray(transactions.userId, userIds));
    await db.delete(withdrawals).where(inArray(withdrawals.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await pool.end();
  }
});