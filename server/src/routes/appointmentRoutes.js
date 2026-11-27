// ROUTES (wiring): plugs the real Express router, login check, role check and Appointments controller into
// the rules in createAppointmentRoutes.js.
// NOT registered yet: routes/index.js does not import this file until the last E2 batch, so these endpoints
// cannot be reached for now.
import { Router } from "express";
import * as controller from "../controllers/appointmentController.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { createAppointmentRoutes } from "./createAppointmentRoutes.js";

export default createAppointmentRoutes({
  router: Router(),
  authenticate,
  requireRole,
  controller,
});
