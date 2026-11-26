// ROUTES (rules): who may call which Pets endpoint, and whose pets.
// The real Express router, login check and controller are handed in, so the tests can use fakes.
// petRoutes.js plugs in the real ones.
//
//   Endpoint               admin   staff   customer
//   GET  /api/pets          all     all     only their OWN pets (the list is filtered for them)
//   GET  /api/pets/:id      any     any     only a pet they own, otherwise 403
//   POST /api/pets          any owner any owner  only with their OWN customerId, otherwise 403
//   PUT  /api/pets/:id      any     any     only a pet they own, and customerId must stay their own (403)
//
// Order of checks for every request:  logged in? (401)  ->  role / ownership? (403)  ->  the controller,
// which runs the existing validation and business rules (400, 404).
// There is no DELETE: pets are kept so their appointment history is preserved.
const STAFF_ROLES = ["admin", "staff"];

// deps = { router, authenticate, requireOwnPetOrRole, scopePetListToOwner, requireOwnerInBody, controller }
export function createPetRoutes({
  router,
  authenticate,
  requireOwnPetOrRole,
  scopePetListToOwner,
  requireOwnerInBody,
  controller,
}) {
  const scopeList = scopePetListToOwner(...STAFF_ROLES);
  const staffOrOwnPet = requireOwnPetOrRole(...STAFF_ROLES);
  const ownerInBody = requireOwnerInBody(...STAFF_ROLES);

  // Runs first for EVERY request to /api/pets/...: no valid login, no entry.
  router.use(authenticate);

  router.get("/", scopeList, controller.listPets); // GET   /api/pets
  router.get("/:id", staffOrOwnPet, controller.getPet); // GET   /api/pets/:id
  router.post("/", ownerInBody, controller.createPet); // POST  /api/pets
  router.put("/:id", staffOrOwnPet, ownerInBody, controller.updatePet); // PUT   /api/pets/:id

  return router;
}
