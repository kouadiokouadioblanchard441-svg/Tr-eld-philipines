import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test, { after, before } from "node:test";
import express from "express";
import bcrypt from "bcrypt";
import type { SupportMessage } from "@shared/schema";
import {
  createAdminSupportConversationsHandler,
  createAdminSupportMessageEditHandler,
} from "./support-message-edit";

const messages = new Map<number, SupportMessage>([
  [1, {
    id: 1,
    userId: 42,
    senderRole: "admin",
    message: "Original response",
    attachmentName: null,
    attachmentMimeType: null,
    attachmentData: null,
    createdAt: new Date("2026-09-05T00:00:00.000Z"),
    editedBy: null,
    editedByName: null,
    editedAt: null,
  }],
  [2, {
    id: 2,
    userId: 42,
    senderRole: "user",
    message: "Client message",
    attachmentName: null,
    attachmentMimeType: null,
    attachmentData: null,
    createdAt: new Date("2026-09-05T00:01:00.000Z"),
    editedBy: null,
    editedByName: null,
    editedAt: null,
  }],
]);

let currentAdminName = "Original support agent";
const databaseConfigured = Boolean(
  process.env.DATABASE_URL && process.env.SESSION_SECRET,
);
let closeDatabase: (() => Promise<void>) | undefined;

const updateSupportMessage = async (id: number, message: string, adminId: number) => {
  const current = messages.get(id);
  if (!current || current.senderRole !== "admin") return undefined;
  const updated = {
    ...current,
    message,
    editedBy: adminId,
    editedByName: currentAdminName,
    editedAt: new Date(),
  };
  messages.set(id, updated);
  return updated;
};

const getAllSupportConversations = async () => [{
  userId: 42,
  userFullName: "Test client",
  userPhone: "0000000000",
  isClosed: false,
  closedAt: null,
  messages: [...messages.values()],
}];

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).session = { userId: 99 };
  next();
});
app.patch(
  "/api/admin/support/messages/:id",
  createAdminSupportMessageEditHandler(updateSupportMessage),
);
app.get(
  "/api/admin/support/conversations",
  createAdminSupportConversationsHandler(getAllSupportConversations),
);

let baseUrl = "";
let server: ReturnType<typeof app.listen>;

before(async () => {
  server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.close();
  await closeDatabase?.();
});

async function request(path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: body === undefined ? "GET" : "PATCH",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("updates administrator messages and returns the edit in conversations", async () => {
  const response = await request("/api/admin/support/messages/1", {
    message: "Updated response",
  });
  assert.equal(response.status, 200);
  const updatedMessage = await response.json();
  assert.equal(updatedMessage.message, "Updated response");
  assert.equal(updatedMessage.editedBy, 99);
  assert.equal(updatedMessage.editedByName, "Original support agent");
  assert.ok(updatedMessage.editedAt);

  currentAdminName = "Renamed support agent";
  const conversationResponse = await request("/api/admin/support/conversations");
  assert.equal(conversationResponse.status, 200);
  const conversations = await conversationResponse.json();
  const updatedConversationMessage = conversations[0].messages.find((item: SupportMessage) => item.id === 1);
  assert.equal(updatedConversationMessage.message, "Updated response");
  assert.equal(updatedConversationMessage.editedByName, "Original support agent");
});

test("rejects client messages, empty edits, and overlong edits", async () => {
  const clientResponse = await request("/api/admin/support/messages/2", {
    message: "Attempted client edit",
  });
  assert.equal(clientResponse.status, 404);

  const emptyResponse = await request("/api/admin/support/messages/1", { message: "   " });
  assert.equal(emptyResponse.status, 400);

  const overlongResponse = await request("/api/admin/support/messages/1", {
    message: "x".repeat(5001),
  });
  assert.equal(overlongResponse.status, 400);
});

test("keeps the edited identity after an administrator is renamed or removed", {
  skip: !databaseConfigured,
}, async () => {
  const [{ db, pool }, { users, supportMessages }, { eq, or }, { DatabaseStorage }] = await Promise.all([
    import("./db"),
     import("@shared/schema"),
    import("drizzle-orm"),
    import("./storage"),
  ]);
  closeDatabase = () => pool.end();

  const uniqueKey = `${Date.now()}${process.pid}`.slice(-10);
  const [customer] = await db.insert(users).values({
    fullName: "Support identity test customer",
    phone: `999${uniqueKey}`,
    country: "TG",
    password: "test-password",
    referralCode: `SUPPORT${uniqueKey}`,
  }).returning({ id: users.id });
  const [editor] = await db.insert(users).values({
    fullName: "Original support agent",
    phone: `998${uniqueKey}`,
    country: "TG",
    password: "test-password",
    referralCode: `EDITOR${uniqueKey}`,
    isAdmin: true,
  }).returning({ id: users.id });

  try {
    const [message] = await db.insert(supportMessages).values({
      userId: customer.id,
      senderRole: "admin",
      message: "Initial response",
    }).returning();
    const storage = new DatabaseStorage();

    const updated = await storage.updateSupportMessage(message.id, "Updated response", editor.id);
    assert.equal(updated?.editedBy, editor.id);
    assert.equal(updated?.editedByName, "Original support agent");

    await db.update(users)
      .set({ fullName: "Renamed support agent" })
      .where(eq(users.id, editor.id));
    const renamedConversation = await storage.getAllSupportConversations();
    const renamedMessage = renamedConversation
      .find((conversation) => conversation.userId === customer.id)
      ?.messages.find((item) => item.id === message.id);
    assert.equal(renamedMessage?.editedByName, "Original support agent");
    assert.equal((await storage.getSupportMessageEditHistory(message.id))[0]?.editedByName, "Original support agent");

    await db.delete(users).where(eq(users.id, editor.id));
    const removedConversation = await storage.getAllSupportConversations();
    const removedMessage = removedConversation
      .find((conversation) => conversation.userId === customer.id)
      ?.messages.find((item) => item.id === message.id);
    assert.equal(removedMessage?.editedBy, null);
    assert.equal(removedMessage?.editedByName, "Original support agent");
    assert.equal((await storage.getSupportMessageEditHistory(message.id))[0]?.editedByName, "Original support agent");
  } finally {
    await db.delete(users).where(or(eq(users.id, customer.id), eq(users.id, editor.id)));
  }
});

test("keeps database-backed support statuses and complete message history", {
  skip: !databaseConfigured,
}, async () => {
  const [{ db, pool }, { users, supportMessages }, { eq, inArray }, { DatabaseStorage }, { registerRoutes }] = await Promise.all([
    import("./db"),
    import("@shared/schema"),
    import("drizzle-orm"),
    import("./storage"),
    import("./routes"),
  ]);
  closeDatabase = () => pool.end();

  // Login validation accepts digits only and limits phone numbers to 15 chars.
  const uniqueKey = `${Date.now()}${process.pid}`.slice(-10);
  const password = await bcrypt.hash("test-password", 4);
  const [admin, pendingCustomer, repliedCustomer, closedCustomer] = await db.insert(users).values([
    {
      fullName: "Support regression administrator",
      phone: `997${uniqueKey}`,
      country: "TG",
      password,
      referralCode: `REGADMIN${uniqueKey}`,
      isAdmin: true,
    },
    {
      fullName: "Pending support customer",
      phone: `996${uniqueKey}`,
      country: "TG",
      password,
      referralCode: `REGPENDING${uniqueKey}`,
    },
    {
      fullName: "Replied support customer",
      phone: `995${uniqueKey}`,
      country: "TG",
      password,
      referralCode: `REGREPLIED${uniqueKey}`,
    },
    {
      fullName: "Closed support customer",
      phone: `994${uniqueKey}`,
      country: "TG",
      password,
      referralCode: `REGCLOSED${uniqueKey}`,
    },
  ]).returning({ id: users.id });

  const fixtureUserIds = [pendingCustomer.id, repliedCustomer.id, closedCustomer.id];
  let integrationServer: ReturnType<typeof createServer> | undefined;

  try {
    const fixtureMessages = await db.insert(supportMessages).values([
      {
        userId: pendingCustomer.id,
        senderRole: "user",
        message: "I still need help",
        createdAt: new Date("2026-09-05T00:01:00.000Z"),
      },
      {
        userId: repliedCustomer.id,
        senderRole: "user",
        message: "Can you help me?",
        createdAt: new Date("2026-09-05T00:02:00.000Z"),
      },
      {
        userId: repliedCustomer.id,
        senderRole: "admin",
        message: "Administrator reply",
        createdAt: new Date("2026-09-05T00:03:00.000Z"),
      },
      {
        userId: closedCustomer.id,
        senderRole: "user",
        message: "Question before closing",
        createdAt: new Date("2026-09-05T00:04:00.000Z"),
      },
      {
        userId: closedCustomer.id,
        senderRole: "admin",
        message: "Reply before closing",
        createdAt: new Date("2026-09-05T00:05:00.000Z"),
      },
      {
        userId: closedCustomer.id,
        senderRole: "admin",
        message: "Final support details",
        createdAt: new Date("2026-09-05T00:06:00.000Z"),
      },
    ]).returning({ id: supportMessages.id });
    const closedMessageIds = fixtureMessages.slice(3).map(({ id }) => id);
    const storage = new DatabaseStorage();

    const closedState = await storage.setSupportConversationClosed(closedCustomer.id, true, admin.id);
    assert.equal(closedState.isClosed, true);
    assert.ok(closedState.closedAt);

    const persistedStatus = await storage.getSupportConversationStatus(closedCustomer.id);
    assert.equal(persistedStatus.isClosed, true);
    assert.ok(persistedStatus.closedAt);

    const messagesAfterClosing = await storage.getSupportMessages(closedCustomer.id);
    assert.deepEqual(messagesAfterClosing.map(({ id }) => id), closedMessageIds);

    const integrationApp = express();
    integrationApp.use(express.json());
    integrationServer = createServer(integrationApp);
    await registerRoutes(integrationServer, integrationApp);
    integrationServer.listen(0);
    await once(integrationServer, "listening");
    const address = integrationServer.address();
    assert(address && typeof address !== "string");

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const login = async (phone: string) => {
      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone,
          password: "test-password",
          country: "TG",
        }),
      });
      assert.equal(loginResponse.status, 200);
      const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
      assert(cookie);
      return cookie;
    };

    const adminCookie = await login(`997${uniqueKey}`);
    const regularUserCookie = await login(`996${uniqueKey}`);
    const response = await fetch(`${baseUrl}/api/admin/support/conversations`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(response.status, 200);
    const conversations = await response.json() as Array<{
      userId: number;
      isClosed: boolean;
      messages: SupportMessage[];
    }>;
    const fixtureConversations = conversations.filter(({ userId }) => fixtureUserIds.includes(userId));
    assert.deepEqual(
      fixtureConversations.map(({ userId }) => userId).sort((a, b) => a - b),
      [...fixtureUserIds].sort((a, b) => a - b),
    );

    const closedConversation = fixtureConversations.find(({ userId }) => userId === closedCustomer.id);
    assert.equal(closedConversation?.isClosed, true);
    assert.deepEqual(closedConversation?.messages.map(({ id }) => id), closedMessageIds);

    const closePendingResponse = await fetch(
      `${baseUrl}/api/admin/support/conversations/${pendingCustomer.id}`,
      {
        method: "PATCH",
        headers: {
          cookie: adminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ isClosed: true }),
      },
    );
    assert.equal(closePendingResponse.status, 200);
    const closedPendingConversation = await closePendingResponse.json() as {
      userId: number;
      isClosed: boolean;
      closedBy: number | null;
    };
    assert.equal(closedPendingConversation.userId, pendingCustomer.id);
    assert.equal(closedPendingConversation.isClosed, true);
    assert.equal(closedPendingConversation.closedBy, admin.id);

    const regularReadResponse = await fetch(`${baseUrl}/api/admin/support/conversations`, {
      headers: { cookie: regularUserCookie },
    });
    assert.equal(regularReadResponse.status, 403);
    assert.deepEqual(await regularReadResponse.json(), { message: "Access denied" });

    const regularUpdateResponse = await fetch(
      `${baseUrl}/api/admin/support/conversations/${pendingCustomer.id}`,
      {
        method: "PATCH",
        headers: {
          cookie: regularUserCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ isClosed: false }),
      },
    );
    assert.equal(regularUpdateResponse.status, 403);
    assert.deepEqual(await regularUpdateResponse.json(), { message: "Access denied" });

    const statusAfterUnauthorizedUpdate = await storage.getSupportConversationStatus(pendingCustomer.id);
    assert.equal(statusAfterUnauthorizedUpdate.isClosed, true);

    const pendingConversation = fixtureConversations.find(({ userId }) => userId === pendingCustomer.id);
    const repliedConversation = fixtureConversations.find(({ userId }) => userId === repliedCustomer.id);
    assert.equal(pendingConversation?.isClosed, false);
    assert.equal(repliedConversation?.isClosed, false);

    const latestMessage = (conversation: typeof fixtureConversations[number]) =>
      conversation.messages.reduce<SupportMessage | undefined>((latest, message) => {
        if (!latest) return message;
        const messageTime = new Date(message.createdAt).getTime();
        const latestTime = new Date(latest.createdAt).getTime();
        return messageTime > latestTime ||
          (messageTime === latestTime && message.id > latest.id)
          ? message
          : latest;
      }, undefined);
    const activeConversationIds = fixtureConversations
      .filter((conversation) => !conversation.isClosed && latestMessage(conversation)?.senderRole !== "user")
      .map(({ userId }) => userId);
    assert.deepEqual(activeConversationIds, [repliedCustomer.id]);
  } finally {
    if (integrationServer) {
      await new Promise<void>((resolve, reject) => {
        integrationServer?.close((error) => error ? reject(error) : resolve());
      });
    }
    await db.delete(users).where(inArray(users.id, [admin.id, ...fixtureUserIds]));
  }
});

test("sends a complete withdrawal request only for an approved identity", {
  skip: !databaseConfigured,
}, async () => {
   const [{ db, pool }, { users, identityVerifications, supportMessages, transactions, withdrawals, platformSettings }, { eq, inArray }, { registerRoutes }] = await Promise.all([
    import("./db"),
    import("@shared/schema"),
    import("drizzle-orm"),
    import("./routes"),
  ]);
  closeDatabase = () => pool.end();

  const uniqueKey = `${Date.now()}${process.pid}`.slice(-10);
  const password = await bcrypt.hash("test-password", 4);
  const [approvedUser, pendingUser] = await db.insert(users).values([
    {
      fullName: "Approved withdrawal customer",
      phone: `993${uniqueKey}`,
      country: "TG",
      password,
      referralCode: `WITHAPPROVED${uniqueKey}`,
      balance: "10000",
      earningsBalance: "10000",
      hasActiveProduct: true,
    },
    {
      fullName: "Pending withdrawal customer",
      phone: `992${uniqueKey}`,
      country: "TG",
      password,
      referralCode: `WITHPENDING${uniqueKey}`,
    },
  ]).returning({ id: users.id, phone: users.phone });
  let integrationServer: ReturnType<typeof createServer> | undefined;

  try {
    await db.insert(identityVerifications).values([
      {
        userId: approvedUser.id,
        fullName: approvedUser.phone,
        idNumber: `APPROVED${uniqueKey}`,
        idFront: "front",
        idBack: "back",
        selfie: "selfie",
        status: "approved",
      },
      {
        userId: pendingUser.id,
        fullName: pendingUser.phone,
        idNumber: `PENDING${uniqueKey}`,
        idFront: "front",
        idBack: "back",
        selfie: "selfie",
        status: "pending",
      },
    ]);

    const integrationApp = express();
    integrationApp.use(express.json());
    integrationServer = createServer(integrationApp);
    await registerRoutes(integrationServer, integrationApp);
    integrationServer.listen(0);
    await once(integrationServer, "listening");
    const address = integrationServer.address();
    assert(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const login = async (phone: string) => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, password: "test-password", country: "TG" }),
      });
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      assert(cookie);
      return cookie;
    };

    const approvedCookie = await login(approvedUser.phone);
    const withdrawalResponse = await fetch(`${baseUrl}/api/support/withdrawal-request`, {
      method: "POST",
      headers: {
        cookie: approvedCookie,
        "content-type": "application/json",
      },
       body: JSON.stringify({ amount: 7000, phone: "+226059546345" }),
    });
    assert.equal(withdrawalResponse.status, 201);
    const withdrawal = await withdrawalResponse.json();
    assert.equal(withdrawal.conversionRate, 1500);
    const configuredFee = Number((await db.select().from(platformSettings)).find((setting) => setting.key === "withdrawalFees")?.value);
    assert.equal(withdrawal.feePercent, configuredFee);
    assert.equal(withdrawal.convertedAmount, 10500000);
    const expectedFee = Math.round(withdrawal.convertedAmount * configuredFee / 100);
    assert.equal(withdrawal.feeAmount, expectedFee);
    assert.equal(withdrawal.netAmount, withdrawal.convertedAmount - expectedFee);
    assert.equal(withdrawal.requestMessage.senderRole, "user");
    assert.match(withdrawal.requestMessage.message, /7\s*000 GPB/u);
    assert.match(withdrawal.requestMessage.message, /\+226059546345/);
    assert.equal(withdrawal.automaticReply.senderRole, "admin");

    const messagesResponse = await fetch(`${baseUrl}/api/support/messages`, {
      headers: { cookie: approvedCookie },
    });
    assert.equal(messagesResponse.status, 200);
    const messages = await messagesResponse.json() as SupportMessage[];
    assert.equal(messages.length, 2);
    assert.equal(messages[0].id, withdrawal.requestMessage.id);
    assert.equal(messages[1].id, withdrawal.automaticReply.id);
    assert.equal(messages[1].message, withdrawal.automaticReply.message);

    const pendingCookie = await login(pendingUser.phone);
    const blockedResponse = await fetch(`${baseUrl}/api/support/withdrawal-request`, {
      method: "POST",
      headers: {
        cookie: pendingCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ amount: 2, phone: "+226059546345" }),
    });
    assert.equal(blockedResponse.status, 403);

    const pendingMessagesResponse = await fetch(`${baseUrl}/api/support/messages`, {
      headers: { cookie: pendingCookie },
    });
    assert.equal(pendingMessagesResponse.status, 200);
    assert.deepEqual(await pendingMessagesResponse.json(), []);
  } finally {
    if (integrationServer) {
      await new Promise<void>((resolve, reject) => {
        integrationServer?.close((error) => error ? reject(error) : resolve());
      });
    }
    const fixtureUserIds = [approvedUser.id, pendingUser.id];
    await db.delete(identityVerifications).where(inArray(identityVerifications.userId, fixtureUserIds));
    await db.delete(supportMessages).where(inArray(supportMessages.userId, fixtureUserIds));
    await db.delete(transactions).where(inArray(transactions.userId, fixtureUserIds));
    await db.delete(withdrawals).where(inArray(withdrawals.userId, fixtureUserIds));
    await db.delete(users).where(inArray(users.id, fixtureUserIds));
  }
});
