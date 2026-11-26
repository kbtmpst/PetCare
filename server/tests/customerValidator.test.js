// Unit tests for the Customers validators. They need no database and no Express.
// Run with:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseId,
  validateCustomerInput,
  validateSearch,
} from "../src/business/validators/customerValidator.js";

const valid = {
  firstName: "Maria",
  lastName: "Santos",
  contactNumber: "0917 123 4567",
  email: "maria.santos@example.com",
  address: "12 Mabini St., Quezon City",
};

test("parseId accepts positive whole numbers only", () => {
  assert.equal(parseId("5"), 5);
  assert.equal(parseId("120"), 120);
  for (const bad of [
    "0",
    "-1",
    "1.5",
    "abc",
    " 2",
    "",
    "01",
    undefined,
    null,
    "4294967296",
    "1e3",
    "CUS-001",
  ]) {
    assert.equal(parseId(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("valid customer data passes", () => {
  const { errors, values } = validateCustomerInput(valid);
  assert.deepEqual(errors, {});
  assert.deepEqual(values, valid);
});

test("email and address are optional", () => {
  const { errors, values } = validateCustomerInput({
    firstName: "Carla",
    lastName: "Mendoza",
    contactNumber: "0919 345 6789",
  });
  assert.deepEqual(errors, {});
  assert.equal(values.email, "");
  assert.equal(values.address, "");
});

test("null or empty email and address are accepted", () => {
  for (const empty of [null, "", "   "]) {
    const { errors, values } = validateCustomerInput({
      ...valid,
      email: empty,
      address: empty,
    });
    assert.deepEqual(errors, {});
    assert.equal(values.email, "");
    assert.equal(values.address, "");
  }
});

test("required fields are reported", () => {
  const { errors } = validateCustomerInput({});
  assert.equal(errors.firstName, "First name is required.");
  assert.equal(errors.lastName, "Last name is required.");
  assert.equal(errors.contactNumber, "Contact number is required.");
  assert.equal(errors.email, undefined);
  assert.equal(errors.address, undefined);
});

test("blank (spaces only) required fields count as missing", () => {
  const { errors } = validateCustomerInput({
    firstName: "   ",
    lastName: "\t",
    contactNumber: " ",
    email: "",
  });
  assert.equal(errors.firstName, "First name is required.");
  assert.equal(errors.lastName, "Last name is required.");
  assert.equal(errors.contactNumber, "Contact number is required.");
});

test("text is trimmed, email is lowercased, phone spacing is kept as typed", () => {
  const { errors, values } = validateCustomerInput({
    firstName: "  Maria ",
    lastName: " Santos  ",
    contactNumber: "  0917 123 4567 ",
    email: "  Maria.Santos@Example.COM ",
    address: "  12 Mabini St.  ",
  });
  assert.deepEqual(errors, {});
  assert.equal(values.firstName, "Maria");
  assert.equal(values.lastName, "Santos");
  assert.equal(values.contactNumber, "0917 123 4567");
  assert.equal(values.email, "maria.santos@example.com");
  assert.equal(values.address, "12 Mabini St.");
});

test("name length limits (50)", () => {
  assert.deepEqual(
    validateCustomerInput({ ...valid, firstName: "x".repeat(50) }).errors,
    {},
  );
  assert.equal(
    validateCustomerInput({ ...valid, firstName: "x".repeat(51) }).errors
      .firstName,
    "First name must be 50 characters or fewer.",
  );
  assert.equal(
    validateCustomerInput({ ...valid, lastName: "x".repeat(51) }).errors
      .lastName,
    "Last name must be 50 characters or fewer.",
  );
});

test("names must be text", () => {
  assert.equal(
    validateCustomerInput({ ...valid, firstName: 123 }).errors.firstName,
    "First name must be text.",
  );
  assert.equal(
    validateCustomerInput({ ...valid, lastName: ["Santos"] }).errors.lastName,
    "Last name must be text.",
  );
});

test("valid phone formats", () => {
  for (const phone of [
    "0917 123 4567",
    "0917-123-4567",
    "+63 917 123 4567",
    "(02) 8123 4567",
    "09171234567",
  ]) {
    assert.equal(
      validateCustomerInput({ ...valid, contactNumber: phone }).errors
        .contactNumber,
      undefined,
      phone,
    );
  }
});

test("invalid phone formats", () => {
  for (const phone of [
    "abc",
    "12345",
    "0917 123 45678901234",
    "09171234567x",
    "++639171234567",
    "0917#1234567",
  ]) {
    assert.ok(
      validateCustomerInput({ ...valid, contactNumber: phone }).errors
        .contactNumber,
      phone,
    );
  }
  assert.ok(
    validateCustomerInput({ ...valid, contactNumber: 9171234567 }).errors
      .contactNumber,
  ); // a number, not text
});

test("contact number longer than 30 characters is rejected", () => {
  const spaced = "0917" + " ".repeat(30) + "1234567";
  assert.equal(
    validateCustomerInput({ ...valid, contactNumber: spaced }).errors
      .contactNumber,
    "Contact number must be 30 characters or fewer.",
  );
});

test("invalid emails", () => {
  for (const email of [
    "not-an-email",
    "a@b",
    "a b@c.com",
    "@example.com",
    "a@@b.com",
  ]) {
    assert.equal(
      validateCustomerInput({ ...valid, email }).errors.email,
      "Enter a valid email address, for example name@example.com.",
      email,
    );
  }
  assert.equal(
    validateCustomerInput({ ...valid, email: 5 }).errors.email,
    "Email must be text.",
  );
  assert.ok(
    validateCustomerInput({ ...valid, email: "a@" + "x".repeat(260) + ".com" })
      .errors.email,
  );
});

test("address rules", () => {
  assert.deepEqual(
    validateCustomerInput({ ...valid, address: "x".repeat(200) }).errors,
    {},
  );
  assert.equal(
    validateCustomerInput({ ...valid, address: "x".repeat(201) }).errors
      .address,
    "Address must be 200 characters or fewer.",
  );
  assert.equal(
    validateCustomerInput({ ...valid, address: 42 }).errors.address,
    "Address must be text.",
  );
});

test("several errors are reported together", () => {
  const { errors } = validateCustomerInput({
    firstName: "",
    lastName: "x".repeat(51),
    contactNumber: "abc",
    email: "bad",
  });
  assert.deepEqual(Object.keys(errors).sort(), [
    "contactNumber",
    "email",
    "firstName",
    "lastName",
  ]);
});

test("body must be a JSON object", () => {
  for (const bad of [null, undefined, "text", 5, true, []]) {
    assert.equal(
      validateCustomerInput(bad).errors.body,
      "The request body must be a JSON object.",
    );
  }
});

test("unknown fields are ignored (id, dateRegistered cannot be set by the client)", () => {
  const { errors, values } = validateCustomerInput({
    ...valid,
    id: 99,
    dateRegistered: "2000-01-01",
    userId: 3,
  });
  assert.deepEqual(errors, {});
  assert.deepEqual(Object.keys(values).sort(), [
    "address",
    "contactNumber",
    "email",
    "firstName",
    "lastName",
  ]);
});

test("search: missing or blank means no filter", () => {
  assert.deepEqual(validateSearch(undefined), {
    errors: {},
    search: undefined,
  });
  assert.deepEqual(validateSearch(""), { errors: {}, search: undefined });
  assert.deepEqual(validateSearch("   "), { errors: {}, search: undefined });
});

test("search: trims the text", () => {
  assert.deepEqual(validateSearch("  maria "), { errors: {}, search: "maria" });
});

test("search: rejects repeated parameters and very long text", () => {
  assert.ok(validateSearch(["a", "b"]).errors.search); // ?search=a&search=b
  assert.ok(validateSearch({ x: "y" }).errors.search); // ?search[x]=y
  assert.ok(validateSearch("x".repeat(101)).errors.search);
  assert.deepEqual(validateSearch("x".repeat(100)).errors, {});
});
