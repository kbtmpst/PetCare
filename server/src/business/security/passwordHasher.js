// SECURITY HELPER: turns a password into a bcrypt hash and checks a password against a hash.
// A hash is a one-way scrambled version of the password. It cannot be turned back into the password,
// so even someone who reads the database cannot see real passwords. bcrypt also adds a random "salt",
// so two users with the same password get different hashes.
// (bcryptjs is the pure-JavaScript bcrypt, which installs without compiling anything on Windows.)
import bcrypt from "bcryptjs";

const DEFAULT_ROUNDS = 10;

// "MyPass123" -> "$2a$10$...." (60 characters). Only the hash is ever saved in the database.
export async function hashPassword(plainPassword, rounds = DEFAULT_ROUNDS) {
  return bcrypt.hash(plainPassword, rounds);
}

// true only when plainPassword is the password that produced passwordHash.
// A broken or missing hash simply gives false (it never throws).
export async function verifyPassword(plainPassword, passwordHash) {
  if (typeof plainPassword !== "string" || typeof passwordHash !== "string")
    return false;
  try {
    return await bcrypt.compare(plainPassword, passwordHash);
  } catch {
    return false;
  }
}
