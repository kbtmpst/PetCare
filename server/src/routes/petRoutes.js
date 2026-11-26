// ROUTES (wiring): plugs the real Express router, login check, ownership checks and Pets controller into
// the rules in createPetRoutes.js. routes/index.js imports this file.
import { Router } from "express";
import * as controller from "../controllers/petController.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireOwnPetOrRole } from "../middleware/requireOwnPetOrRole.js";
import {
  scopePetListToOwner,
  requireOwnerInBody,
} from "../middleware/scopePetsToOwner.js";
import { createPetRoutes } from "./createPetRoutes.js";

export default createPetRoutes({
  router: Router(),
  authenticate,
  requireOwnPetOrRole,
  scopePetListToOwner,
  requireOwnerInBody,
  controller,
});
