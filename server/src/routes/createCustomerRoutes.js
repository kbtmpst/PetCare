// ROUTES (rules): who may call which Customers endpoint.
// The real Express router, login check and controller are handed in, so the tests can use fakes.
// customerRoutes.js plugs in the real ones.
//
//   Endpoint              admin   staff   customer
//   GET  /api/customers    yes     yes     no  (403)
//   POST /api/customers    yes     yes     no  (403)
//   GET  /api/customers/:id  yes any id   yes any id   only their OWN id (otherwise 403)
//   PUT  /api/customers/:id  yes any id   yes any id   only their OWN id (otherwise 403)
//
// Order of checks for every request:  logged in? (401)  ->  role / ownership? (403)  ->  the controller,
// which runs the existing validation and business rules (400, 404).
// There is no DELETE: pets and appointments refer to customers.
const STAFF_ROLES = ["admin", "staff"];

// deps = { router, authenticate, requireRole, requireOwnCustomerOrRole, controller }
export function createCustomerRoutes({
  router,
  authenticate,
  requireRole,
  requireOwnCustomerOrRole,
  controller,
}) {
  const staffOnly = requireRole(...STAFF_ROLES);
  const staffOrOwner = requireOwnCustomerOrRole(...STAFF_ROLES);

  // Runs first for EVERY request to /api/customers/...: no valid login, no entry.
  router.use(authenticate);

  router.get("/", staffOnly, controller.listCustomers); // GET   /api/customers
  router.get("/:id", staffOrOwner, controller.getCustomer); // GET   /api/customers/:id
  router.post("/", staffOnly, controller.createCustomer); // POST  /api/customers
  router.put("/:id", staffOrOwner, controller.updateCustomer); // PUT   /api/customers/:id

  return router;
}
