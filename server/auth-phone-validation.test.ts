import assert from "node:assert/strict";
import test from "node:test";
import { loginSchema, registerSchema } from "@shared/schema";

const BURKINA_PHONE_ERROR = "Vous devez avoir un numéro de téléphone de 8 chiffres";

function firstPhoneError(schema: typeof loginSchema | typeof registerSchema, data: Record<string, unknown>) {
  const result = schema.safeParse(data);
  assert.equal(result.success, false);
  return result.error.issues.find((issue) => issue.path[0] === "phone")?.message;
}

test("requires exactly eight digits for Burkina Faso login and registration", () => {
  const loginData = {
    phone: "50123456",
    country: "BF",
    password: "secret",
  };
  const registerData = {
    fullName: "Test User",
    phone: "50123456",
    country: "BF",
    password: "secret",
    confirmPassword: "secret",
  };

  assert.equal(loginSchema.safeParse(loginData).success, true);
  assert.equal(registerSchema.safeParse(registerData).success, true);

  for (const phone of ["1234567", "123456789", "+22650123456", "50 123456", "abcdefgh"]) {
    assert.equal(firstPhoneError(loginSchema, { ...loginData, phone }), BURKINA_PHONE_ERROR);
    assert.equal(firstPhoneError(registerSchema, { ...registerData, phone }), BURKINA_PHONE_ERROR);
  }
});