// Unit tests for the authentication validators. They need no database, no Express and no packages.
// Run with:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validatePassword,
  validateRegisterInput,
  validateLoginInput,
  validateChangePasswordInput,
} from "../src/business/validators/authValidator.js";

const validRegistration = {
  email: "maria.santos@example.com",
  password: "Sup3rSecret",
  firstName: "Maria",
  lastName: "Santos",
  contactNumber: "0917 123 4567",
  address: "12 Mabini St., Quezon City",
};

// ---------------------------------------------------------------------------
// validatePassword
// ---------------------------------------------------------------------------

test("validatePassword accepts good passwords", () => {
  for (const good of [
    "abcdefg1",
    "Sup3rSecret",
    "pass word 1",
    "ñandú12345",
    "a".repeat(71) + "1",
  ]) {
    assert.equal(validatePassword(good), null, good);
  }
});

test("validatePassword: required and type", () => {
  for (const missing of [undefined, null, ""])
    assert.equal(validatePassword(missing), "Password is required.");
  for (const wrongType of [12345678, true, ["abcdefg1"], { a: 1 }]) {
    assert.equal(validatePassword(wrongType), "Password must be text.");
  }
});

test("validatePassword: length boundaries (8 minimum, 72 bytes maximum)", () => {
  assert.equal(
    validatePassword("abcdef1"),
    "Password must be at least 8 characters.",
  ); // 7
  assert.equal(validatePassword("abcdefg1"), null); // 8
  assert.equal(validatePassword("a".repeat(71) + "1"), null); // exactly 72 bytes
  assert.match(validatePassword("a".repeat(72) + "1"), /too long/); // 73 bytes
  // 40 two-byte characters + digit = 81 bytes, although only 41 characters long
  assert.match(validatePassword("é".repeat(40) + "1"), /too long/);
});

test("validatePassword: needs a letter and a number", () => {
  const message = "Password must contain at least one letter and one number.";
  assert.equal(validatePassword("abcdefgh"), message);
  assert.equal(validatePassword("12345678"), message);
  assert.equal(validatePassword("        "), message);
  assert.equal(validatePassword("!!!!!!!!"), message);
});

test("validatePassword uses the label it is given", () => {
  assert.equal(
    validatePassword("", "New password"),
    "New password is required.",
  );
});

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

test("register: valid data passes and is cleaned", () => {
  const { errors, values } = validateRegisterInput({
    ...validRegistration,
    email: "  Maria.Santos@Example.COM ",
    firstName: "  Maria ",
    address: "  12 Mabini St., Quezon City ",
  });
  assert.deepEqual(errors, {});
  assert.deepEqual(values, validRegistration);
});

test("register: the password is never trimmed or changed", () => {
  const { errors, values } = validateRegisterInput({
    ...validRegistration,
    password: "  Sup3rSecret  ",
  });
  assert.deepEqual(errors, {});
  assert.equal(values.password, "  Sup3rSecret  ");
});

test("register: address is optional", () => {
  const { address, ...withoutAddress } = validRegistration; // eslint-disable-line no-unused-vars
  const { errors, values } = validateRegisterInput(withoutAddress);
  assert.deepEqual(errors, {});
  assert.equal(values.address, "");
});

test("register: required fields are reported", () => {
  const { errors } = validateRegisterInput({});
  assert.equal(errors.email, "Email is required.");
  assert.equal(errors.password, "Password is required.");
  assert.equal(errors.firstName, "First name is required.");
  assert.equal(errors.lastName, "Last name is required.");
  assert.equal(errors.contactNumber, "Contact number is required.");
  assert.equal(errors.address, undefined);
});

test("register: invalid emails", () => {
  for (const email of [
    "not-an-email",
    "a@b",
    "a b@c.com",
    "@example.com",
    "a@@b.com",
  ]) {
    assert.equal(
      validateRegisterInput({ ...validRegistration, email }).errors.email,
      "Enter a valid email address, for example name@example.com.",
      email,
    );
  }
  assert.equal(
    validateRegisterInput({ ...validRegistration, email: 5 }).errors.email,
    "Email must be text.",
  );
  assert.equal(
    validateRegisterInput({ ...validRegistration, email: "   " }).errors.email,
    "Email is required.",
  );
  assert.match(
    validateRegisterInput({
      ...validRegistration,
      email: "a@" + "x".repeat(260) + ".com",
    }).errors.email,
    /255 characters/,
  );
});

test("register: weak passwords are rejected", () => {
  assert.ok(
    validateRegisterInput({ ...validRegistration, password: "short1" }).errors
      .password,
  );
  assert.ok(
    validateRegisterInput({ ...validRegistration, password: "onlyletters" })
      .errors.password,
  );
  assert.ok(
    validateRegisterInput({ ...validRegistration, password: "12345678" }).errors
      .password,
  );
});

test("register: profile fields follow the Customers rules", () => {
  assert.ok(
    validateRegisterInput({ ...validRegistration, firstName: "x".repeat(51) })
      .errors.firstName,
  );
  assert.ok(
    validateRegisterInput({ ...validRegistration, lastName: "   " }).errors
      .lastName,
  );
  assert.ok(
    validateRegisterInput({ ...validRegistration, contactNumber: "abc" }).errors
      .contactNumber,
  );
  assert.ok(
    validateRegisterInput({ ...validRegistration, address: "x".repeat(201) })
      .errors.address,
  );
});

test("register: a role in the request is ignored (it can never create an admin)", () => {
  const { errors, values } = validateRegisterInput({
    ...validRegistration,
    role: "admin",
    isActive: false,
    id: 1,
  });
  assert.deepEqual(errors, {});
  assert.deepEqual(Object.keys(values).sort(), [
    "address",
    "contactNumber",
    "email",
    "firstName",
    "lastName",
    "password",
  ]);
});

test("register: body must be a JSON object", () => {
  for (const bad of [null, undefined, "text", 5, true, []]) {
    assert.equal(
      validateRegisterInput(bad).errors.body,
      "The request body must be a JSON object.",
    );
  }
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

test("login: valid input passes, email is lowercased, password untouched", () => {
  const { errors, values } = validateLoginInput({
    email: "  MARIA@Example.com ",
    password: " Any pass ",
  });
  assert.deepEqual(errors, {});
  assert.deepEqual(values, {
    email: "maria@example.com",
    password: " Any pass ",
  });
});

test("login: does not apply the new-password rules (an old short password can still be checked)", () => {
  assert.deepEqual(
    validateLoginInput({ email: "a@b.com", password: "x" }).errors,
    {},
  );
});

test("login: required fields and types", () => {
  const { errors } = validateLoginInput({});
  assert.equal(errors.email, "Email is required.");
  assert.equal(errors.password, "Password is required.");
  assert.equal(
    validateLoginInput({ email: 5, password: 5 }).errors.email,
    "Email must be text.",
  );
  assert.equal(
    validateLoginInput({ email: "a@b.com", password: 5 }).errors.password,
    "Password must be text.",
  );
  assert.equal(
    validateLoginInput({ email: "a@b.com", password: "x".repeat(1001) }).errors
      .password,
    "Password is too long.",
  );
});

test("login: body must be a JSON object", () => {
  for (const bad of [null, undefined, "text", 5, []]) {
    assert.ok(validateLoginInput(bad).errors.body);
  }
});

// ---------------------------------------------------------------------------
// change password
// ---------------------------------------------------------------------------

test("change password: valid input passes", () => {
  const { errors, values } = validateChangePasswordInput({
    currentPassword: "OldPass123",
    newPassword: "NewPass456",
  });
  assert.deepEqual(errors, {});
  assert.deepEqual(values, {
    currentPassword: "OldPass123",
    newPassword: "NewPass456",
  });
});

test("change password: required fields", () => {
  const { errors } = validateChangePasswordInput({});
  assert.equal(errors.currentPassword, "Current password is required.");
  assert.equal(errors.newPassword, "New password is required.");
});

test("change password: the new password follows the password rules", () => {
  assert.match(
    validateChangePasswordInput({
      currentPassword: "OldPass123",
      newPassword: "short1",
    }).errors.newPassword,
    /at least 8 characters/,
  );
  assert.match(
    validateChangePasswordInput({
      currentPassword: "OldPass123",
      newPassword: "onlyletters",
    }).errors.newPassword,
    /letter and one number/,
  );
});

test("change password: the new password must differ from the current one", () => {
  assert.equal(
    validateChangePasswordInput({
      currentPassword: "SamePass123",
      newPassword: "SamePass123",
    }).errors.newPassword,
    "The new password must be different from the current password.",
  );
});

test("change password: body must be a JSON object", () => {
  for (const bad of [null, undefined, "text", 5, []]) {
    assert.ok(validateChangePasswordInput(bad).errors.body);
  }
});
