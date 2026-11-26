// MIDDLEWARE (logic): checks that a request comes from a logged-in user.
// The things it needs (token check, database lookup) are handed in as "deps" so the tests can use fakes.
// authenticate.js plugs in the real ones.
//
// How it works:
//   1. read the "Authorization: Bearer <token>" header
//   2. check the token (signature and expiry)
//   3. load the user from the database, so a deactivated account is blocked immediately
//   4. put the user in req.user for the next functions
import { asyncHandler } from "./asyncHandler.js";

function sendError(res, status, message) {
  res.status(status).json({ status: "error", message });
}

// deps = { verifyToken(token) -> { ok, userId, reason }, findUserById(id) -> user or null }
export function createAuthenticate({ verifyToken, findUserById }) {
  return asyncHandler(async (req, res, next) => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
    if (!match)
      return sendError(res, 401, "Authentication required. Please log in.");

    const result = verifyToken(match[1]);
    if (!result.ok) {
      return sendError(
        res,
        401,
        result.reason === "expired"
          ? "Your session has expired. Please log in again."
          : "Invalid login token. Please log in again.",
      );
    }

    const user = await findUserById(result.userId);
    if (!user)
      return sendError(res, 401, "Invalid login token. Please log in again.");
    if (!user.active)
      return sendError(
        res,
        403,
        "This account has been deactivated. Please contact the clinic.",
      );

    req.user = user; // { id, email, role, fullName, active, customerId }
    next();
  });
}
