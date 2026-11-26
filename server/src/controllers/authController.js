// CONTROLLER: handles the HTTP side of the authentication API.
// It reads the request, calls the business layer, and turns the result into an HTTP response.
// It contains no validation rules and no SQL. No response ever contains a password or a password hash.
import * as authService from "../business/services/authService.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

// Which HTTP status code each kind of failure uses.
const FAILURE_STATUS = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  conflict: 409,
};

// Sends { status: "error", message, errors? } for a failed result.
function sendFailure(res, result) {
  res.status(FAILURE_STATUS[result.type]).json({
    status: "error",
    message: result.message,
    errors: result.errors, // left out of the JSON when undefined
  });
}

// POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  if (!result.ok) return sendFailure(res, result);
  res
    .status(201)
    .json({ status: "ok", data: { token: result.token, user: result.user } });
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  if (!result.ok) return sendFailure(res, result);
  res.json({ status: "ok", data: { token: result.token, user: result.user } });
});

// GET /api/auth/me   (authenticate has already put the user in req.user)
export const me = (req, res) => {
  res.json({ status: "ok", data: req.user });
};

// POST /api/auth/change-password   (authenticate has already put the user in req.user)
export const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user.id, req.body);
  if (!result.ok) return sendFailure(res, result);
  res.json({ status: "ok", message: "Password changed." });
});
