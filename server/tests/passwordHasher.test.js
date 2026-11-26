// Tests for the REAL bcrypt password helper (needs the "bcryptjs" package: npm install bcryptjs).
// If the package is not installed yet, these tests are SKIPPED instead of failing.
import { test } from "node:test";
import assert from "node:assert/strict";

let hasher = null;
try {
  hasher = await import("../src/business/security/passwordHasher.js");
} catch {
  hasher = null; // bcryptjs is not installed in this environment
}
const skip =
  hasher === null
    ? "bcryptjs is not installed here (npm install bcryptjs)"
    : false;
const ROUNDS = 4; // the lowest allowed value, so the tests run fast

test(
  "hashPassword makes a 60-character bcrypt hash that is not the password",
  { skip },
  async () => {
    const hash = await hasher.hashPassword("Sup3rSecret", ROUNDS);
    assert.equal(typeof hash, "string");
    assert.equal(hash.length, 60);
    assert.match(hash, /^\$2[aby]\$04\$/); // "$2a$04$" = bcrypt with 4 rounds
    assert.ok(!hash.includes("Sup3rSecret"));
  },
);

test(
  "hashing the same password twice gives different hashes (random salt)",
  { skip },
  async () => {
    const first = await hasher.hashPassword("Sup3rSecret", ROUNDS);
    const second = await hasher.hashPassword("Sup3rSecret", ROUNDS);
    assert.notEqual(first, second);
  },
);

test(
  "verifyPassword: the right password is accepted, a wrong one is not",
  { skip },
  async () => {
    const hash = await hasher.hashPassword("Sup3rSecret", ROUNDS);
    assert.equal(await hasher.verifyPassword("Sup3rSecret", hash), true);
    assert.equal(await hasher.verifyPassword("sup3rsecret", hash), false); // capital letters matter
    assert.equal(await hasher.verifyPassword("Sup3rSecret ", hash), false); // spaces matter
    assert.equal(await hasher.verifyPassword("", hash), false);
  },
);

test(
  "verifyPassword never throws for a broken hash or a non-text value",
  { skip },
  async () => {
    assert.equal(
      await hasher.verifyPassword("Sup3rSecret", "not-a-bcrypt-hash"),
      false,
    );
    assert.equal(await hasher.verifyPassword("Sup3rSecret", ""), false);
    assert.equal(await hasher.verifyPassword("Sup3rSecret", undefined), false);
    assert.equal(
      await hasher.verifyPassword(
        undefined,
        "$2a$04$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234",
      ),
      false,
    );
    assert.equal(await hasher.verifyPassword(12345678, "x"), false);
  },
);

test("the default number of rounds is 10", { skip }, async () => {
  const hash = await hasher.hashPassword("Sup3rSecret");
  assert.match(hash, /^\$2[aby]\$10\$/);
});
