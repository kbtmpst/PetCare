// ROUTES (rules): which Appointments endpoints exist, and that every one of them needs a login.
// The real Express router, login check and controller are handed in, so the tests can use fakes.
// appointmentRoutes.js plugs in the real ones.
//
//   Endpoint                          admin   staff   customer
//   GET   /api/appointments            all     all     only their OWN appointments (the list is filtered for them)
//   GET   /api/appointments/:id        any     any     only their own, otherwise 403
//   POST  /api/appointments            any pet any pet only for their OWN pets, otherwise 403
//   PUT   /api/appointments/:id        any     any     only their own Pending one, own pets only, otherwise 403 / 409
//   PATCH /api/appointments/:id/status any     any     only cancel their own Pending or Confirmed one
//
// Order of checks for every request:  logged in? (401)  ->  a known role? (403)  ->  the controller.
// The controller hands the request and the actor ({ role, customerId } taken from req.user only) to the
// business layer, which makes EVERY ownership and status decision (400, 403, 404, 409).
// That is why there is no separate ownership middleware here: one place decides, so the rules cannot drift apart.
// There is no DELETE: an appointment is cancelled (PATCH status), so its history is kept.
const ALL_ROLES = ["admin", "staff", "customer"];

// deps = { router, authenticate, requireRole, controller }
export function createAppointmentRoutes({
  router,
  authenticate,
  requireRole,
  controller,
}) {
  const anyKnownRole = requireRole(...ALL_ROLES);

  // Runs first for EVERY request to /api/appointments/...: no valid login, no entry.
  router.use(authenticate);

  router.get("/", anyKnownRole, controller.listAppointments); // GET    /api/appointments
  router.get("/:id", anyKnownRole, controller.getAppointment); // GET    /api/appointments/:id
  router.post("/", anyKnownRole, controller.createAppointment); // POST   /api/appointments
  router.put("/:id", anyKnownRole, controller.updateAppointment); // PUT    /api/appointments/:id
  router.patch("/:id/status", anyKnownRole, controller.changeAppointmentStatus); // PATCH  /api/appointments/:id/status

  return router;
}
