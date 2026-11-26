// MIDDLEWARE (logic): for routes like /api/pets/:id, where the id in the URL is a PET id.
// Use it AFTER authenticate:
//   router.get("/:id", requireOwnPetOrRole("admin", "staff"), getPet);
//
// Who gets through:
//   - the roles you list (for example admin and staff): any pet id (no database lookup is needed)
//   - a customer: ONLY a pet whose owner is their own customer profile (pet.customer_id === req.user.customerId)
//   - everyone else: 403
//
// A customer gets the SAME 403 for a pet that belongs to someone else, a pet that does not exist, and an id
// that is not even a number ("abc", "0", "1.5"). That way a customer cannot find out which pets exist.
//
// The pet lookup is handed in as a "dep" so the tests can use a fake (no MySQL).
// requireOwnPetOrRole.js plugs in the real one.
import { asyncHandler } from "./asyncHandler.js";
import { parseId } from "../business/validators/petValidator.js";

const ROLES = ["admin", "staff", "customer"];

// deps = { findPetOwnerId(petId) -> the owner's customer id, or null when the pet does not exist }
export function createRequireOwnPetOrRole({ findPetOwnerId }) {
  return function requireOwnPetOrRole(...fullAccessRoles) {
    // Fail loudly at setup time on a typo, just like requireRole does.
    if (
      fullAccessRoles.length === 0 ||
      fullAccessRoles.some((role) => !ROLES.includes(role))
    ) {
      throw new Error(
        `requireOwnPetOrRole needs one or more of: ${ROLES.join(", ")}.`,
      );
    }

    return asyncHandler(async (req, res, next) => {
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

      // A customer: allowed only for a pet they own.
      if (req.user.role === "customer") {
        const petId = parseId(req.params.id); // null when the id is not a plain positive whole number
        const ownId = req.user.customerId; // null when the account has no customer profile
        if (petId !== null && Number.isInteger(ownId) && ownId > 0) {
          const ownerId = await findPetOwnerId(petId); // null when the pet does not exist
          if (ownerId !== null && ownerId === ownId) return next();
        }
      }

      return res
        .status(403)
        .json({
          status: "error",
          message: "You do not have permission to do this.",
        });
    });
  };
}
