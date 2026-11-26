// ROUTES (logic): the Services endpoints AND who may use them.
// The things it needs (the router, the login check, the role check and the controller) are handed in,
// so the tests can use fakes. serviceRoutes.js plugs in the real ones.
//
// Who may do what:
//   - everyone must be logged in (a valid token), otherwise 401
//   - admin, staff and customer may READ services
//   - only admin may create, edit or activate/deactivate a service, otherwise 403
//
// Order of checks for every request:  logged in? (401)  ->  allowed role? (403)  ->  the controller,
// which runs the existing validation and business rules (400, 404, 409).
// There is no DELETE: services are deactivated, never deleted (appointments refer to them).
const READ_ROLES = ["admin", "staff", "customer"];
const WRITE_ROLES = ["admin"];

// deps = { router, authenticate, requireRole, controller }
export function createServiceRoutes({
  router,
  authenticate,
  requireRole,
  controller,
}) {
  const canRead = requireRole(...READ_ROLES);
  const adminOnly = requireRole(...WRITE_ROLES);

  // Runs first for EVERY request to /api/services/...: no valid login, no entry.
  router.use(authenticate);

  router.get("/", canRead, controller.listServices); // GET   /api/services
  router.get("/:id", canRead, controller.getService); // GET   /api/services/:id
  router.post("/", adminOnly, controller.createService); // POST  /api/services
  router.put("/:id", adminOnly, controller.updateService); // PUT   /api/services/:id
  router.patch("/:id/status", adminOnly, controller.updateServiceStatus); // PATCH /api/services/:id/status

  return router;
}
