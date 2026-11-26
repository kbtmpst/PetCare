// ROUTES (wiring): plugs the real Express router, login check, role checks and Customers controller into
// the rules in createCustomerRoutes.js. routes/index.js imports this file.
import { Router } from "express";
import * as controller from "../controllers/customerController.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireOwnCustomerOrRole } from "../middleware/requireOwnCustomerOrRole.js";
import { createCustomerRoutes } from "./createCustomerRoutes.js";

export default createCustomerRoutes({
  router: Router(),
  authenticate,
  requireRole,
  requireOwnCustomerOrRole,
  controller,
});
