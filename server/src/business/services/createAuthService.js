// BUSINESS LAYER: the rules for registering, logging in and changing a password.
// This file only contains the LOGIC. The things it needs (database functions, password hashing, token
// creation) are handed in as "deps", so the tests can give it fake versions and run without MySQL.
// authService.js plugs in the real ones.
//
// Every function returns a result object, never throws for a "normal" problem:
//   { ok: true, ... }                                          it worked
//   { ok: false, type: "validation", message, errors }         the input is wrong            (HTTP 400)
//   { ok: false, type: "unauthorized", message }               not logged in / wrong login   (HTTP 401)
//   { ok: false, type: "forbidden", message }                  not allowed (deactivated)     (HTTP 403)
//   { ok: false, type: "conflict", message, errors }           the email is already used     (HTTP 409)
import {
  validateRegisterInput,
  validateLoginInput,
  validateChangePasswordInput,
} from "../validators/authValidator.js";

// One message for "no such email" AND "wrong password", so nobody can use the login form to find out
// which email addresses have an account.
const INVALID_LOGIN_MESSAGE = "Invalid email or password.";

function validationFailure(errors) {
  return {
    ok: false,
    type: "validation",
    message: "Validation failed. Please check the fields.",
    errors,
  };
}

function invalidLogin() {
  return { ok: false, type: "unauthorized", message: INVALID_LOGIN_MESSAGE };
}

// Removes the password hash from a record that has one. Only the safe user goes into a response.
function toPublicUser(record) {
  const { passwordHash, ...user } = record; // eslint-disable-line no-unused-vars
  return user;
}

// deps = {
//   users:  the user repository functions (findUserById, findCredentialsByEmail, findCredentialsById,
//           createCustomerAccount, updatePasswordHash),
//   hasher: { hash(plain) -> hash, verify(plain, hash) -> true/false },
//   tokens: { sign(userId) -> token string },
// }
export function createAuthService({ users, hasher, tokens }) {
  // A real-looking hash used when the email does not exist, so a login for an unknown email takes about
  // as long as one for a known email (otherwise the response time would reveal which emails exist).
  let dummyHashPromise = null;
  function getDummyHash() {
    if (!dummyHashPromise)
      dummyHashPromise = hasher.hash("a-password-nobody-uses-1");
    return dummyHashPromise;
  }

  // Customer self-registration. Creates the login account and the customer profile together.
  async function register(body) {
    const { errors, values } = validateRegisterInput(body);
    if (Object.keys(errors).length > 0) return validationFailure(errors);

    const passwordHash = await hasher.hash(values.password);

    let ids;
    try {
      ids = await users.createCustomerAccount({
        email: values.email,
        passwordHash,
        firstName: values.firstName,
        lastName: values.lastName,
        contactNumber: values.contactNumber,
        address: values.address,
      });
    } catch (error) {
      // The database UNIQUE rule on users.email says this email already has an account.
      if (error.code === "ER_DUP_ENTRY") {
        return {
          ok: false,
          type: "conflict",
          message: "An account with this email already exists.",
          errors: { email: "An account with this email already exists." },
        };
      }
      throw error;
    }

    const user = await users.findUserById(ids.userId);
    return { ok: true, user, token: tokens.sign(user.id) };
  }

  async function login(body) {
    const { errors, values } = validateLoginInput(body);
    if (Object.keys(errors).length > 0) return validationFailure(errors);

    const record = await users.findCredentialsByEmail(values.email);

    if (!record) {
      await hasher.verify(values.password, await getDummyHash()); // same work as a real check
      return invalidLogin();
    }

    const passwordMatches = await hasher.verify(
      values.password,
      record.passwordHash,
    );
    if (!passwordMatches) return invalidLogin();

    // Only someone who knows the correct password is told that the account is switched off.
    if (!record.active) {
      return {
        ok: false,
        type: "forbidden",
        message:
          "This account has been deactivated. Please contact the clinic.",
      };
    }

    return {
      ok: true,
      user: toPublicUser(record),
      token: tokens.sign(record.id),
    };
  }

  // The logged-in user changes their own password. "userId" comes from the verified token, never from the body.
  async function changePassword(userId, body) {
    const { errors, values } = validateChangePasswordInput(body);
    if (Object.keys(errors).length > 0) return validationFailure(errors);

    const record = await users.findCredentialsById(userId);
    if (!record)
      return {
        ok: false,
        type: "unauthorized",
        message: "Authentication required. Please log in.",
      };

    if (!(await hasher.verify(values.currentPassword, record.passwordHash))) {
      return validationFailure({
        currentPassword: "Current password is incorrect.",
      });
    }

    await users.updatePasswordHash(
      userId,
      await hasher.hash(values.newPassword),
    );
    return { ok: true };
  }

  return { register, login, changePassword };
}
