// ROUTES (wiring): plugs the real Express router, login check, role check and Services controller into
// the rules in createServiceRoutes.js. routes/index.js imports this file.
import { Router } from "express";
import * as controller from "../controllers/serviceController.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { createServiceRoutes } from "./createServiceRoutes.js";

export default createServiceRoutes({
  router: Router(),
  authenticate,
  requireRole,
  controller,
});
