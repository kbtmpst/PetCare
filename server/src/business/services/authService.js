// BUSINESS LAYER (wiring): connects the authentication logic to the REAL database, bcrypt and JWT.
// The logic itself is in createAuthService.js. The controller imports register, login and changePassword
// from here.
import * as userRepository from "../../data/repositories/userRepository.js";
import { hashPassword, verifyPassword } from "../security/passwordHasher.js";
import { signToken } from "../security/tokenService.js";
import { config } from "../../config/env.js";
import { createAuthService } from "./createAuthService.js";

const authService = createAuthService({
  users: userRepository,
  hasher: {
    hash: (plainPassword) =>
      hashPassword(plainPassword, config.auth.bcryptRounds),
    verify: verifyPassword,
  },
  tokens: {
    sign: (userId) =>
      signToken(userId, config.auth.jwtSecret, config.auth.jwtExpiresIn),
  },
});

export const register = authService.register;
export const login = authService.login;
export const changePassword = authService.changePassword;
