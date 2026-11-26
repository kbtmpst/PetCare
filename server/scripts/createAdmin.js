// ONE-TIME SCRIPT: creates the first admin account.
// Run it from the server folder with:   npm run create-admin
//
// Safety rules:
//   - it refuses to run if an admin account already exists (so you cannot create one by accident twice)
//   - the password is typed twice at a hidden prompt: it is not shown, not saved in a file, and not
//     passed on the command line (so it does not end up in the command history)
//   - only the bcrypt hash of the password is saved in the database
import { config } from "../src/config/env.js";
import { pool } from "../src/data/database/pool.js";
import * as userRepository from "../src/data/repositories/userRepository.js";
import { hashPassword } from "../src/business/security/passwordHasher.js";
import { validatePassword } from "../src/business/validators/authValidator.js";
import { askVisible, askHidden } from "./terminalPrompt.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTEMPTS = 3;

async function main() {
  if (!process.stdin.isTTY) {
    console.error(
      "This script must be run in a normal terminal window, because it asks for a hidden password.",
    );
    return 1;
  }

  if ((await userRepository.countAdmins()) > 0) {
    console.error(
      "An admin account already exists, so no new admin was created.",
    );
    console.error(
      "(More staff and admin accounts will be created from inside the app in a later step.)",
    );
    return 1;
  }

  console.log("Create the first PetCare admin account.");
  console.log("Press Ctrl+C at any time to cancel.\n");

  // Email
  let email = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !email; attempt++) {
    const typed = (await askVisible("Admin email: ")).trim().toLowerCase();
    if (!EMAIL_PATTERN.test(typed) || typed.length > 255) {
      console.error(
        "  Enter a valid email address, for example admin@example.com.",
      );
    } else if (await userRepository.emailExists(typed)) {
      console.error("  A login account with that email already exists.");
    } else {
      email = typed;
    }
  }
  if (!email) {
    console.error("Too many attempts. No admin was created.");
    return 1;
  }

  // Full name
  let fullName = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !fullName; attempt++) {
    const typed = (await askVisible("Full name: ")).trim();
    if (!typed || typed.length > 100)
      console.error("  Enter a name of 1 to 100 characters.");
    else fullName = typed;
  }
  if (!fullName) {
    console.error("Too many attempts. No admin was created.");
    return 1;
  }

  // Password (typed twice, hidden)
  console.log(
    "\nThe password needs at least 8 characters with at least one letter and one number.",
  );
  let password = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !password; attempt++) {
    const first = await askHidden("Password (hidden): ");
    const problem = validatePassword(first, "Password");
    if (problem) {
      console.error(`  ${problem}`);
      continue;
    }
    const second = await askHidden("Type the password again: ");
    if (first !== second) {
      console.error("  The two passwords do not match.");
      continue;
    }
    password = first;
  }
  if (!password) {
    console.error("Too many attempts. No admin was created.");
    return 1;
  }

  const passwordHash = await hashPassword(password, config.auth.bcryptRounds);
  password = ""; // drop the plain password as soon as it is no longer needed

  const id = await userRepository.createAdmin({
    email,
    passwordHash,
    fullName,
  });
  console.log(`\nDone. Admin account created: ${email} (user id ${id}).`);
  console.log("You can now log in with POST /api/auth/login.");
  return 0;
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  if (error.code === "ER_DUP_ENTRY") {
    console.error(
      "A login account with that email already exists. No admin was created.",
    );
  } else {
    console.error(
      `Could not create the admin (${error.code || error.message}). Is MySQL running and is server/.env correct?`,
    );
  }
} finally {
  await pool.end();
}
process.exit(exitCode);
