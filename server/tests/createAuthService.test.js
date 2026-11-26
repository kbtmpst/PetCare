// Tests for the authentication business logic. The database, the password hashing and the token creation
// are FAKES here (no MySQL, no bcrypt, no JWT), so this checks the RULES of the service only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthService } from "../src/business/services/createAuthService.js";

const validRegistration = {
  email: "Maria.Santos@Example.com",
  password: "Sup3rSecret",
  firstName: "Maria",
  lastName: "Santos",
  contactNumber: "0917 123 4567",
  address: "12 Mabini St.",
};

// A fake "database" with a few functions, plus a log of every call (so tests can see what happened).
function setup({
  accounts = [],
  duplicateOnCreate = false,
  createError = null,
} = {}) {
  const calls = [];
  const db = {
    accounts: accounts.map((account) => ({ ...account })),
    createdAccounts: [],
    passwordUpdates: [],
  };

  const users = {
    async findUserById(id) {
      calls.push("findUserById");
      const account = db.accounts.find((a) => a.id === id);
      if (!account) return null;
      const { passwordHash, ...user } = account; // eslint-disable-line no-unused-vars
      return user;
    },
    async findCredentialsByEmail(email) {
      calls.push(`findCredentialsByEmail:${email}`);
      return db.accounts.find((a) => a.email === email) ?? null;
    },
    async findCredentialsById(id) {
      calls.push("findCredentialsById");
      return db.accounts.find((a) => a.id === id) ?? null;
    },
    async createCustomerAccount(input) {
      calls.push("createCustomerAccount");
      if (createError) throw createError;
      if (duplicateOnCreate)
        throw Object.assign(new Error("Duplicate entry"), {
          code: "ER_DUP_ENTRY",
        });
      db.createdAccounts.push(input);
      const id = 100 + db.createdAccounts.length;
      db.accounts.push({
        id,
        email: input.email,
        passwordHash: input.passwordHash,
        role: "customer",
        fullName: `${input.firstName} ${input.lastName}`,
        active: true,
        customerId: 500 + id,
      });
      return { userId: id, customerId: 500 + id };
    },
    async updatePasswordHash(id, passwordHash) {
      calls.push("updatePasswordHash");
      db.passwordUpdates.push({ id, passwordHash });
      db.accounts.find((a) => a.id === id).passwordHash = passwordHash;
    },
  };

  const hasherCalls = { hash: [], verify: [] };
  const hasher = {
    hash: async (plain) => {
      hasherCalls.hash.push(plain);
      return `hashed(${plain})`;
    },
    verify: async (plain, hash) => {
      hasherCalls.verify.push([plain, hash]);
      return hash === `hashed(${plain})`;
    },
  };
  const tokens = { sign: (userId) => `token-for-${userId}` };

  return {
    service: createAuthService({ users, hasher, tokens }),
    db,
    calls,
    hasherCalls,
  };
}

const account = (overrides = {}) => ({
  id: 7,
  email: "staff@example.com",
  passwordHash: "hashed(Correct123)",
  role: "staff",
  fullName: "Sam Staff",
  active: true,
  customerId: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

test("register: creates a customer account, stores only the hash, and returns a token and a safe user", async () => {
  const { service, db } = setup();
  const result = await service.register(validRegistration);

  assert.equal(result.ok, true);
  assert.equal(db.createdAccounts.length, 1);
  const saved = db.createdAccounts[0];
  assert.equal(saved.email, "maria.santos@example.com"); // lowercased
  assert.equal(saved.passwordHash, "hashed(Sup3rSecret)"); // the hash
  assert.ok(!Object.values(saved).includes("Sup3rSecret")); // the plain password is not stored anywhere
  assert.equal(saved.firstName, "Maria");
  assert.equal(saved.address, "12 Mabini St.");

  assert.equal(result.token, "token-for-101");
  assert.equal(result.user.role, "customer");
  assert.equal(result.user.email, "maria.santos@example.com");
  assert.equal(result.user.customerId, 601);
});

test("register: the response never contains a password or a hash", async () => {
  const { service } = setup();
  const result = await service.register(validRegistration);
  const text = JSON.stringify(result);
  assert.ok(!text.includes("Sup3rSecret"));
  assert.ok(!text.includes("hashed("));
  assert.ok(!("passwordHash" in result.user));
  assert.ok(!("password" in result.user));
});

test("register: a role sent in the request is ignored, the account is always a customer", async () => {
  const { service, db } = setup();
  const result = await service.register({
    ...validRegistration,
    role: "admin",
  });
  assert.equal(result.ok, true);
  assert.equal(result.user.role, "customer");
  assert.ok(!("role" in db.createdAccounts[0])); // the repository decides the role itself
});

test("register: does NOT look for or link to an existing walk-in customer with the same email", async () => {
  const { service, calls } = setup();
  await service.register(validRegistration);
  assert.deepEqual(calls, ["createCustomerAccount", "findUserById"]); // no customer lookup of any kind
});

test("register: invalid input gives 400 and nothing is hashed or saved", async () => {
  const { service, db, hasherCalls } = setup();
  const result = await service.register({ email: "bad", password: "x" });
  assert.equal(result.ok, false);
  assert.equal(result.type, "validation");
  assert.ok(result.errors.email);
  assert.ok(result.errors.password);
  assert.ok(result.errors.firstName);
  assert.equal(db.createdAccounts.length, 0);
  assert.equal(hasherCalls.hash.length, 0);
});

test("register: a duplicate email gives 409", async () => {
  const { service } = setup({ duplicateOnCreate: true });
  const result = await service.register(validRegistration);
  assert.equal(result.ok, false);
  assert.equal(result.type, "conflict");
  assert.equal(
    result.errors.email,
    "An account with this email already exists.",
  );
});

test("register: any other database error is re-thrown (the error handler answers 500)", async () => {
  const boom = Object.assign(new Error("connection lost"), {
    code: "PROTOCOL_CONNECTION_LOST",
  });
  const { service } = setup({ createError: boom });
  await assert.rejects(
    service.register(validRegistration),
    (error) => error === boom,
  );
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

test("login: correct email and password return a token and a safe user", async () => {
  const { service } = setup({ accounts: [account()] });
  const result = await service.login({
    email: "staff@example.com",
    password: "Correct123",
  });
  assert.equal(result.ok, true);
  assert.equal(result.token, "token-for-7");
  assert.equal(result.user.role, "staff");
  assert.ok(!("passwordHash" in result.user));
  assert.ok(!JSON.stringify(result).includes("hashed("));
});

test("login: the email is not case-sensitive", async () => {
  const { service, calls } = setup({ accounts: [account()] });
  const result = await service.login({
    email: "  STAFF@Example.COM ",
    password: "Correct123",
  });
  assert.equal(result.ok, true);
  assert.ok(calls.includes("findCredentialsByEmail:staff@example.com"));
});

test("login: a wrong password and an unknown email give the SAME generic 401", async () => {
  const { service } = setup({ accounts: [account()] });
  const wrongPassword = await service.login({
    email: "staff@example.com",
    password: "Wrong1234",
  });
  const unknownEmail = await service.login({
    email: "nobody@example.com",
    password: "Correct123",
  });
  assert.equal(wrongPassword.type, "unauthorized");
  assert.equal(unknownEmail.type, "unauthorized");
  assert.equal(wrongPassword.message, "Invalid email or password.");
  assert.deepEqual(unknownEmail, wrongPassword);
});

test("login: an unknown email still does one password check (so the timing does not give it away)", async () => {
  const { service, hasherCalls } = setup({ accounts: [account()] });
  await service.login({ email: "nobody@example.com", password: "Whatever123" });
  assert.equal(hasherCalls.verify.length, 1);
  assert.equal(hasherCalls.verify[0][0], "Whatever123");
});

test("login: a deactivated account with the CORRECT password gets 403", async () => {
  const { service } = setup({ accounts: [account({ active: false })] });
  const result = await service.login({
    email: "staff@example.com",
    password: "Correct123",
  });
  assert.equal(result.ok, false);
  assert.equal(result.type, "forbidden");
});

test("login: a deactivated account with a WRONG password gets the generic 401 (no information leak)", async () => {
  const { service } = setup({ accounts: [account({ active: false })] });
  const result = await service.login({
    email: "staff@example.com",
    password: "Wrong1234",
  });
  assert.equal(result.type, "unauthorized");
  assert.equal(result.message, "Invalid email or password.");
});

test("login: missing fields give 400", async () => {
  const { service } = setup();
  const result = await service.login({});
  assert.equal(result.type, "validation");
  assert.ok(result.errors.email);
  assert.ok(result.errors.password);
  assert.equal((await service.login(undefined)).type, "validation");
});

// ---------------------------------------------------------------------------
// change password
// ---------------------------------------------------------------------------

test("changePassword: saves the HASH of the new password", async () => {
  const { service, db } = setup({ accounts: [account()] });
  const result = await service.changePassword(7, {
    currentPassword: "Correct123",
    newPassword: "Brand9NewPass",
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(db.passwordUpdates, [
    { id: 7, passwordHash: "hashed(Brand9NewPass)" },
  ]);
  assert.ok(!JSON.stringify(db.passwordUpdates).includes('"Brand9NewPass"'));
});

test("changePassword: after the change the new password logs in and the old one does not", async () => {
  const { service } = setup({ accounts: [account()] });
  await service.changePassword(7, {
    currentPassword: "Correct123",
    newPassword: "Brand9NewPass",
  });
  assert.equal(
    (
      await service.login({
        email: "staff@example.com",
        password: "Brand9NewPass",
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await service.login({
        email: "staff@example.com",
        password: "Correct123",
      })
    ).ok,
    false,
  );
});

test("changePassword: a wrong current password is refused and nothing is saved", async () => {
  const { service, db } = setup({ accounts: [account()] });
  const result = await service.changePassword(7, {
    currentPassword: "Wrong1234",
    newPassword: "Brand9NewPass",
  });
  assert.equal(result.type, "validation");
  assert.equal(result.errors.currentPassword, "Current password is incorrect.");
  assert.equal(db.passwordUpdates.length, 0);
});

test("changePassword: a weak or unchanged new password is refused and nothing is saved", async () => {
  const { service, db } = setup({ accounts: [account()] });
  const weak = await service.changePassword(7, {
    currentPassword: "Correct123",
    newPassword: "short1",
  });
  assert.equal(weak.type, "validation");
  assert.ok(weak.errors.newPassword);
  const same = await service.changePassword(7, {
    currentPassword: "Correct123",
    newPassword: "Correct123",
  });
  assert.equal(same.type, "validation");
  assert.equal(db.passwordUpdates.length, 0);
});

test("changePassword: a user that no longer exists gets 401", async () => {
  const { service } = setup();
  const result = await service.changePassword(999, {
    currentPassword: "Correct123",
    newPassword: "Brand9NewPass",
  });
  assert.equal(result.type, "unauthorized");
});

test("changePassword: invalid body gives 400", async () => {
  const { service } = setup({ accounts: [account()] });
  assert.equal((await service.changePassword(7, null)).type, "validation");
  assert.equal((await service.changePassword(7, {})).type, "validation");
});
