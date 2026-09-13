import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import express from "express";
import bcrypt from "bcrypt";

const databaseConfigured = Boolean(
  process.env.DATABASE_URL && process.env.SESSION_SECRET,
);

type Country = {
  id: number;
  code: string;
  name: string;
  currency: string;
  phonePrefix: string;
  operators: string;
  isActive: boolean;
};

type PaymentNumber = {
  id: number;
  ownerName: string;
  phone: string;
  operatorName: string;
  country: string;
  isActive: boolean;
};

async function startRoutesServer(registerRoutes: typeof import("./routes")["registerRoutes"]) {
  const app = express();
  app.use(express.json());
  const server = createServer(app);
  await registerRoutes(server, app);
  server.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("keeps admin country, setting, and payment-number changes after restart", {
  skip: !databaseConfigured,
}, async () => {
  const [{ db, pool }, schema, { eq }, { registerRoutes }, { seed }] = await Promise.all([
    import("./db"),
    import("@shared/schema"),
    import("drizzle-orm"),
    import("./routes"),
    import("./seed"),
  ]);
  const { adminAuditLog, countries, paymentNumbers, platformSettings, users } = schema;
  const uniqueKey = `${Date.now()}${process.pid}`.slice(-10);
  const password = "admin-persistence-test-password";
  const adminPhone = `7${uniqueKey.slice(-9)}`;
  const originalSettings = new Map<string, string | null>();
  let adminId: number | undefined;
  let country: Country | undefined;
  let paymentNumberId: number | undefined;
  let firstServer: Server | undefined;
  let restartedServer: Server | undefined;

  try {
    await seed();
    [country] = await db.select().from(countries).where(eq(countries.code, "TG"));
    assert(country, "The seeded Togo country is required for this test");

    for (const key of ["minDeposit", "depositConversionRate"]) {
      const [setting] = await db
        .select({ value: platformSettings.value })
        .from(platformSettings)
        .where(eq(platformSettings.key, key));
      originalSettings.set(key, setting?.value ?? null);
    }

    const [admin] = await db.insert(users).values({
      fullName: "Admin persistence test",
      phone: adminPhone,
      country: "TG",
      password: await bcrypt.hash(password, 4),
      referralCode: `ADMINPERSIST${uniqueKey}`,
      isAdmin: true,
      isSuperAdmin: true,
    }).returning({ id: users.id });
    adminId = admin.id;

    const running = await startRoutesServer(registerRoutes);
    firstServer = running.server;

    const request = async (
      baseUrl: string,
      path: string,
      options: RequestInit = {},
    ) => fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    });

    const login = async (baseUrl: string) => {
      const response = await request(baseUrl, "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          phone: adminPhone,
          password,
          country: "TG",
        }),
      });
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      assert(cookie, "The administrator login must create a session cookie");
      return cookie;
    };

    const adminCookie = await login(running.baseUrl);
    const adminRequest = (
      baseUrl: string,
      path: string,
      options: RequestInit = {},
    ) => request(baseUrl, path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        cookie: adminCookie,
      },
    });

    const countryUpdate = {
      name: "Togo Persistent QA",
      currency: "QAF",
      phonePrefix: "229",
      operators: JSON.stringify(["QA Money", "QA Mobile"]),
      isActive: true,
    };
    const countryUpdateResponse = await adminRequest(
      running.baseUrl,
      `/api/admin/countries/${country.id}`,
      { method: "PUT", body: JSON.stringify(countryUpdate) },
    );
    assert.equal(countryUpdateResponse.status, 200);
    assert.deepEqual(await countryUpdateResponse.json(), {
      ...country,
      ...countryUpdate,
    });

    const countryReadResponse = await adminRequest(running.baseUrl, "/api/admin/countries");
    assert.equal(countryReadResponse.status, 200);
    const countryRead = (await countryReadResponse.json() as Country[])
      .find((item) => item.id === country.id);
    assert.deepEqual(countryRead, { ...country, ...countryUpdate });

    const settingsUpdateResponse = await adminRequest(
      running.baseUrl,
      "/api/admin/settings",
      {
        method: "POST",
        body: JSON.stringify({
          minDeposit: "4321",
          depositConversionRate: "1777",
        }),
      },
    );
    assert.equal(settingsUpdateResponse.status, 200);

    const settingsReadResponse = await adminRequest(running.baseUrl, "/api/admin/settings");
    assert.equal(settingsReadResponse.status, 200);
    const settingsRead = await settingsReadResponse.json() as Record<string, string>;
    assert.equal(settingsRead.minDeposit, "4321");
    assert.equal(settingsRead.depositConversionRate, "1777");

    const paymentCreateResponse = await adminRequest(
      running.baseUrl,
      "/api/admin/payment-numbers",
      {
        method: "POST",
        body: JSON.stringify({
          ownerName: "QA payment owner",
          phone: "9012345678",
          operatorName: "QA Money",
          country: "TG",
        }),
      },
    );
    assert.equal(paymentCreateResponse.status, 200);
    const createdPayment = await paymentCreateResponse.json() as PaymentNumber;
    paymentNumberId = createdPayment.id;
    assert.equal(createdPayment.operatorName, "QA Money");
    assert.equal(createdPayment.isActive, true);

    const paymentUpdateResponse = await adminRequest(
      running.baseUrl,
      `/api/admin/payment-numbers/${paymentNumberId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          ownerName: "Updated QA owner",
          phone: "9012345679",
          operatorName: "QA Mobile",
          country: "TG",
        }),
      },
    );
    assert.equal(paymentUpdateResponse.status, 200);
    const updatedPayment = await paymentUpdateResponse.json() as PaymentNumber;
    assert.equal(updatedPayment.ownerName, "Updated QA owner");
    assert.equal(updatedPayment.phone, "9012345679");
    assert.equal(updatedPayment.operatorName, "QA Mobile");

    const deactivateResponse = await adminRequest(
      running.baseUrl,
      `/api/admin/payment-numbers/${paymentNumberId}`,
      { method: "PUT", body: JSON.stringify({ isActive: false }) },
    );
    assert.equal(deactivateResponse.status, 200);
    assert.equal((await deactivateResponse.json() as PaymentNumber).isActive, false);

    const paymentReadResponse = await adminRequest(running.baseUrl, "/api/admin/payment-numbers");
    assert.equal(paymentReadResponse.status, 200);
    const paymentRead = (await paymentReadResponse.json() as PaymentNumber[])
      .find((item) => item.id === paymentNumberId);
    assert.equal(paymentRead?.isActive, false);

    const deleteResponse = await adminRequest(
      running.baseUrl,
      `/api/admin/payment-numbers/${paymentNumberId}`,
      { method: "DELETE" },
    );
    assert.equal(deleteResponse.status, 200);
    paymentNumberId = undefined;

    await closeServer(firstServer);
    firstServer = undefined;
    await seed();

    const restarted = await startRoutesServer(registerRoutes);
    restartedServer = restarted.server;
    const restartedCookie = await login(restarted.baseUrl);
    const restartedRequest = (
      path: string,
      options: RequestInit = {},
    ) => request(restarted.baseUrl, path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        cookie: restartedCookie,
      },
    });

    const countryAfterRestartResponse = await restartedRequest("/api/admin/countries");
    assert.equal(countryAfterRestartResponse.status, 200);
    const countryAfterRestart = (await countryAfterRestartResponse.json() as Country[])
      .find((item) => item.id === country.id);
    assert.deepEqual(countryAfterRestart, { ...country, ...countryUpdate });

    const settingsAfterRestartResponse = await restartedRequest("/api/admin/settings");
    assert.equal(settingsAfterRestartResponse.status, 200);
    const settingsAfterRestart = await settingsAfterRestartResponse.json() as Record<string, string>;
    assert.equal(settingsAfterRestart.minDeposit, "4321");
    assert.equal(settingsAfterRestart.depositConversionRate, "1777");

    const paymentsAfterRestartResponse = await restartedRequest("/api/admin/payment-numbers");
    assert.equal(paymentsAfterRestartResponse.status, 200);
    const paymentsAfterRestart = await paymentsAfterRestartResponse.json() as PaymentNumber[];
    assert.equal(paymentsAfterRestart.some((item) => item.id === createdPayment.id), false);
  } finally {
    if (firstServer) await closeServer(firstServer);
    if (restartedServer) await closeServer(restartedServer);
    if (paymentNumberId !== undefined) {
      await db.delete(paymentNumbers).where(eq(paymentNumbers.id, paymentNumberId));
    }
    if (country) {
      await db.update(countries).set({
        name: country.name,
        currency: country.currency,
        phonePrefix: country.phonePrefix,
        operators: country.operators,
        isActive: country.isActive,
      }).where(eq(countries.id, country.id));
    }
    for (const [key, value] of originalSettings) {
      if (value !== null) {
        await db.update(platformSettings)
          .set({ value })
          .where(eq(platformSettings.key, key));
      }
    }
    if (adminId !== undefined) {
      await db.delete(adminAuditLog).where(eq(adminAuditLog.adminId, adminId));
      await db.delete(users).where(eq(users.id, adminId));
    }
    await pool.end();
  }
});