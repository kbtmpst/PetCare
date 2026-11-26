// Unit tests for the Services validators. They need no database and no Express.
// Run with:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseId,
  validateServiceInput,
  validateStatusInput,
  validateActiveFilter,
} from "../src/business/validators/serviceValidator.js";

const valid = {
  name: "Full Groom",
  description: "Bath and trim",
  price: 650,
  durationMinutes: 90,
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
    undefined,
    "4294967296",
    "1e3",
  ]) {
    assert.equal(parseId(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("a valid body passes and is trimmed", () => {
  const { errors, values } = validateServiceInput({
    ...valid,
    name: "  Full Groom  ",
  });
  assert.deepEqual(errors, {});
  assert.equal(values.name, "Full Groom");
  assert.equal(values.active, undefined);
});

test("numeric strings are accepted for price and duration", () => {
  const { errors, values } = validateServiceInput({
    ...valid,
    price: "19.99",
    durationMinutes: "45",
  });
  assert.deepEqual(errors, {});
  assert.equal(values.price, 19.99);
  assert.equal(values.durationMinutes, 45);
});

test("description is optional", () => {
  const { errors, values } = validateServiceInput({
    name: "Nail Trim",
    price: 100,
    durationMinutes: 15,
  });
  assert.deepEqual(errors, {});
  assert.equal(values.description, "");
});

test("required fields are reported", () => {
  const { errors } = validateServiceInput({});
  assert.equal(errors.name, "Service name is required.");
  assert.equal(errors.price, "Price is required.");
  assert.equal(errors.durationMinutes, "Duration is required.");
});

test("name rules", () => {
  assert.ok(validateServiceInput({ ...valid, name: "   " }).errors.name);
  assert.ok(validateServiceInput({ ...valid, name: 123 }).errors.name);
  assert.ok(
    validateServiceInput({ ...valid, name: "x".repeat(51) }).errors.name,
  );
  assert.deepEqual(
    validateServiceInput({ ...valid, name: "x".repeat(50) }).errors,
    {},
  );
});

test("description rules", () => {
  assert.ok(
    validateServiceInput({ ...valid, description: "x".repeat(201) }).errors
      .description,
  );
  assert.ok(
    validateServiceInput({ ...valid, description: 5 }).errors.description,
  );
});

test("price rules", () => {
  assert.equal(
    validateServiceInput({ ...valid, price: "abc" }).errors.price,
    "Price must be a number.",
  );
  assert.equal(
    validateServiceInput({ ...valid, price: -1 }).errors.price,
    "Price cannot be negative.",
  );
  assert.ok(validateServiceInput({ ...valid, price: 100001 }).errors.price);
  assert.ok(validateServiceInput({ ...valid, price: 10.999 }).errors.price);
  assert.ok(validateServiceInput({ ...valid, price: true }).errors.price);
  assert.ok(validateServiceInput({ ...valid, price: "1e3" }).errors.price);
  assert.deepEqual(validateServiceInput({ ...valid, price: 0 }).errors, {});
  assert.deepEqual(
    validateServiceInput({ ...valid, price: 100000 }).errors,
    {},
  );
});

test("duration rules", () => {
  assert.ok(
    validateServiceInput({ ...valid, durationMinutes: 0 }).errors
      .durationMinutes,
  );
  assert.ok(
    validateServiceInput({ ...valid, durationMinutes: -5 }).errors
      .durationMinutes,
  );
  assert.ok(
    validateServiceInput({ ...valid, durationMinutes: 601 }).errors
      .durationMinutes,
  );
  assert.equal(
    validateServiceInput({ ...valid, durationMinutes: 30.5 }).errors
      .durationMinutes,
    "Duration must be a whole number of minutes.",
  );
  assert.ok(
    validateServiceInput({ ...valid, durationMinutes: "abc" }).errors
      .durationMinutes,
  );
  assert.deepEqual(
    validateServiceInput({ ...valid, durationMinutes: 600 }).errors,
    {},
  );
});

test("active must be a boolean when sent", () => {
  assert.ok(validateServiceInput({ ...valid, active: "yes" }).errors.active);
  assert.equal(
    validateServiceInput({ ...valid, active: false }).values.active,
    false,
  );
});

test("body must be a JSON object", () => {
  for (const bad of [null, undefined, "text", 5, []]) {
    assert.ok(validateServiceInput(bad).errors.body);
    assert.ok(validateStatusInput(bad).errors.body);
  }
});

test("status body", () => {
  assert.equal(validateStatusInput({ active: true }).active, true);
  assert.equal(validateStatusInput({ active: false }).active, false);
  assert.ok(validateStatusInput({}).errors.active);
  assert.ok(validateStatusInput({ active: "true" }).errors.active);
  assert.ok(validateStatusInput({ active: 1 }).errors.active);
});

test("active filter", () => {
  assert.equal(validateActiveFilter(undefined).active, undefined);
  assert.equal(validateActiveFilter("true").active, true);
  assert.equal(validateActiveFilter("false").active, false);
  assert.ok(validateActiveFilter("maybe").errors.active);
  assert.ok(validateActiveFilter("TRUE").errors.active);
});
