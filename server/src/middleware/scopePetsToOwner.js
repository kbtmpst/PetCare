// MIDDLEWARE: keeps a CUSTOMER inside their own pets on the routes that do not have a pet id in the URL.
// Admin and staff (the roles you list) pass through untouched, so they keep today's behaviour.
// Use both AFTER authenticate. No database lookup is needed: req.user.customerId was loaded by authenticate.
//
//   router.get("/",  scopePetListToOwner("admin", "staff"),  listPets);   // customer: list is forced to own pets
//   router.post("/", requireOwnerInBody("admin", "staff"),   createPet);  // customer: customerId must be their own
//   router.put("/:id", ..., requireOwnerInBody("admin", "staff"), updatePet); // customer cannot give a pet away
import { parseId } from "../business/validators/petValidator.js";

const ROLES = ["admin", "staff", "customer"];

function checkRoles(name, fullAccessRoles) {
  if (
    fullAccessRoles.length === 0 ||
    fullAccessRoles.some((role) => !ROLES.includes(role))
  ) {
    throw new Error(`${name} needs one or more of: ${ROLES.join(", ")}.`);
  }
}

function sendNotLoggedIn(res) {
  return res
    .status(401)
    .json({
      status: "error",
      message: "Authentication required. Please log in.",
    });
}

function sendForbidden(res) {
  return res
    .status(403)
    .json({
      status: "error",
      message: "You do not have permission to do this.",
    });
}

// The customer's own profile id, or null when this user is not a customer with a profile.
function ownCustomerId(user) {
  return user.role === "customer" &&
    Number.isInteger(user.customerId) &&
    user.customerId > 0
    ? user.customerId
    : null;
}

// GET /api/pets: for a customer, ?customerId= is REPLACED by their own id, so the existing controller
// only ever lists their own pets (and ?search= still works inside them). A customer asking for someone
// else's pets simply gets their own list; nothing is revealed.
export function scopePetListToOwner(...fullAccessRoles) {
  checkRoles("scopePetListToOwner", fullAccessRoles);

  return (req, res, next) => {
    if (!req.user) return sendNotLoggedIn(res);
    if (fullAccessRoles.includes(req.user.role)) return next();

    const ownId = ownCustomerId(req.user);
    if (ownId === null) return sendForbidden(res);

    // Express 4 keeps req.query as a plain property, Express 5 as a getter on the prototype (so changing the
    // object it returns would be lost). Defining our own property on the request works with both.
    Object.defineProperty(req, "query", {
      value: { ...req.query, customerId: String(ownId) },
      writable: true,
      configurable: true,
      enumerable: true,
    });
    return next();
  };
}

// POST /api/pets and PUT /api/pets/:id: for a customer, the owner named in the body must be themselves.
// A valid but different customerId gets 403 (no planting pets on someone else, no giving a pet away).
// A missing or invalid customerId is NOT answered here: the existing validator gives its normal 400.
export function requireOwnerInBody(...fullAccessRoles) {
  checkRoles("requireOwnerInBody", fullAccessRoles);

  return (req, res, next) => {
    if (!req.user) return sendNotLoggedIn(res);
    if (fullAccessRoles.includes(req.user.role)) return next();

    const ownId = ownCustomerId(req.user);
    if (ownId === null) return sendForbidden(res);

    const sent = req.body?.customerId;
    if (typeof sent === "number" || typeof sent === "string") {
      const sentId = parseId(sent); // the same reading of customerId that the validator uses
      if (sentId !== null && sentId !== ownId) return sendForbidden(res);
    }
    return next();
  };
}
