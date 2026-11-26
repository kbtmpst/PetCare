// MIDDLEWARE (wiring): the real "must be logged in" check, using the real token check and the database.
// Use it in a route file:   router.get("/me", authenticate, controllerFunction);
import { createAuthenticate } from "./createAuthenticate.js";
import { verifyToken } from "../business/security/tokenService.js";
import { findUserById } from "../data/repositories/userRepository.js";
import { config } from "../config/env.js";

export const authenticate = createAuthenticate({
  verifyToken: (token) => verifyToken(token, config.auth.jwtSecret),
  findUserById,
});
