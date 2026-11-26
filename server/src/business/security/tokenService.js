// SECURITY HELPER: creates and checks login tokens (JWT, "JSON Web Token").
// After a successful login the server gives the browser a token. The browser sends it back with every
// request (Authorization: Bearer <token>). The token is signed with a secret that only the server knows,
// so it cannot be changed or forged without the server noticing.
// The token only carries the user's id and an expiry time. The role and "is the account still active"
// are always read fresh from the database (see createAuthenticate.js).
import jwt from "jsonwebtoken";

const ALGORITHM = "HS256"; // the only signing method this server creates and accepts

// Creates a token for a user id. expiresIn is for example "8h".
export function signToken(userId, secret, expiresIn) {
  return jwt.sign({}, secret, {
    algorithm: ALGORITHM,
    expiresIn,
    subject: String(userId),
  });
}

// Checks a token. Returns:
//   { ok: true, userId }                       a good token
//   { ok: false, reason: "expired" }           it was good but the time is over
//   { ok: false, reason: "invalid" }           wrong secret, edited, wrong algorithm, or not a token at all
export function verifyToken(token, secret) {
  try {
    const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
    if (typeof payload.sub !== "string" || !/^[1-9]\d*$/.test(payload.sub)) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, userId: Number(payload.sub) };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === "TokenExpiredError" ? "expired" : "invalid",
    };
  }
}
