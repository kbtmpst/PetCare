// Tests for the REAL JWT helper (needs the "jsonwebtoken" package: npm install jsonwebtoken).
// If the package is not installed yet, these tests are SKIPPED instead of failing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

let tokenService = null;
let jwt = null;
try {
  tokenService = await import("../src/business/security/tokenService.js");
  jwt = (await import("jsonwebtoken")).default;
} catch {
  tokenService = null; // jsonwebtoken is not installed in this environment
}
const skip =
  tokenService === null
    ? "jsonwebtoken is not installed here (npm install jsonwebtoken)"
    : false;

const SECRET = "test-secret-test-secret-test-secret-123456";
const base64url = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const decodePayload = (token) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

test("a signed token verifies and gives back the user id", { skip }, () => {
  const token = tokenService.signToken(42, SECRET, "8h");
  assert.equal(token.split(".").length, 3);
  assert.deepEqual(tokenService.verifyToken(token, SECRET), {
    ok: true,
    userId: 42,
  });
});

test(
  "the token lasts the requested time (8h = 28800 seconds) and holds only the user id",
  { skip },
  () => {
    const payload = decodePayload(tokenService.signToken(42, SECRET, "8h"));
    assert.equal(payload.exp - payload.iat, 8 * 60 * 60);
    assert.equal(payload.sub, "42");
    assert.deepEqual(Object.keys(payload).sort(), ["exp", "iat", "sub"]); // no email, no role, no password
  },
);

test("a token signed with a different secret is invalid", { skip }, () => {
  const token = tokenService.signToken(
    42,
    "another-secret-another-secret-another-1",
    "8h",
  );
  assert.deepEqual(tokenService.verifyToken(token, SECRET), {
    ok: false,
    reason: "invalid",
  });
});

test("a token whose payload was edited is invalid", { skip }, () => {
  const token = tokenService.signToken(42, SECRET, "8h");
  const [header, , signature] = token.split(".");
  const forged = `${header}.${base64url({ sub: "1", iat: 1, exp: 9999999999 })}.${signature}`;
  assert.equal(tokenService.verifyToken(forged, SECRET).ok, false);
});

test("an expired token is reported as expired", { skip }, () => {
  const token = jwt.sign({}, SECRET, {
    algorithm: "HS256",
    subject: "42",
    expiresIn: -10,
  });
  assert.deepEqual(tokenService.verifyToken(token, SECRET), {
    ok: false,
    reason: "expired",
  });
});

test("an unsigned token (algorithm 'none') is rejected", { skip }, () => {
  const unsigned = `${base64url({ alg: "none", typ: "JWT" })}.${base64url({ sub: "42", exp: 9999999999 })}.`;
  assert.deepEqual(tokenService.verifyToken(unsigned, SECRET), {
    ok: false,
    reason: "invalid",
  });
});

test(
  "a token signed with another algorithm (HS512) is rejected, even with the right secret",
  { skip },
  () => {
    const token = jwt.sign({}, SECRET, {
      algorithm: "HS512",
      subject: "42",
      expiresIn: "1h",
    });
    assert.deepEqual(tokenService.verifyToken(token, SECRET), {
      ok: false,
      reason: "invalid",
    });
  },
);

test(
  "a correctly signed token with a bad subject is rejected",
  { skip },
  () => {
    for (const subject of ["abc", "0", "-5", "1.5", ""]) {
      const header = base64url({ alg: "HS256", typ: "JWT" });
      const body = base64url({ sub: subject, exp: 9999999999 });
      const signature = createHmac("sha256", SECRET)
        .update(`${header}.${body}`)
        .digest("base64url");
      assert.equal(
        tokenService.verifyToken(`${header}.${body}.${signature}`, SECRET).ok,
        false,
        subject,
      );
    }
    const noSubject = jwt.sign({}, SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    assert.equal(tokenService.verifyToken(noSubject, SECRET).ok, false);
  },
);

test("garbage is invalid and never throws", { skip }, () => {
  for (const garbage of [
    "",
    "abc",
    "a.b.c",
    "....",
    "Bearer x",
    undefined,
    null,
    12345,
  ]) {
    assert.deepEqual(
      tokenService.verifyToken(garbage, SECRET),
      { ok: false, reason: "invalid" },
      String(garbage),
    );
  }
});
