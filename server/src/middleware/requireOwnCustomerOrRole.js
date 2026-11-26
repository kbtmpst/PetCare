// MIDDLEWARE: for routes like /api/customers/:id.
// Use it AFTER authenticate:
//   router.get("/:id", requireOwnCustomerOrRole("admin", "staff"), getCustomer);
//
// Who gets through:
//   - the roles you list (for example admin and staff): any id
//   - a customer: ONLY the id of their own customer profile (req.user.customerId)
//   - everyone else: 403
//
// A customer gets the SAME 403 for every id that is not theirs, whether the id exists, does not exist,
// or is not even a number ("abc", "0", "1.5"). That way a customer cannot find out which ids exist.
import { parseId } from "../business/validators/customerValidator.js";

const ROLES = ["admin", "staff", "customer"];

export function requireOwnCustomerOrRole(...fullAccessRoles) {
  // Fail loudly at setup time on a typo, just like requireRole does.
  if (
    fullAccessRoles.length === 0 ||
    fullAccessRoles.some((role) => !ROLES.includes(role))
  ) {
    throw new Error(
      `requireOwnCustomerOrRole needs one or more of: ${ROLES.join(", ")}.`,
    );
  }

  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          status: "error",
          message: "Authentication required. Please log in.",
        });
    }

    // Admin and staff: allowed for every id. The controller then runs its normal 400 / 404 checks.
    if (fullAccessRoles.includes(req.user.role)) return next();

    // A customer: allowed only for their own profile.
    if (req.user.role === "customer") {
      const requestedId = parseId(req.params.id); // null when the id is not a plain positive whole number
      const ownId = req.user.customerId; // null when the account has no customer profile
      if (
        requestedId !== null &&
        Number.isInteger(ownId) &&
        requestedId === ownId
      )
        return next();
    }

    return res
      .status(403)
      .json({
        status: "error",
        message: "You do not have permission to do this.",
      });
  };
}
