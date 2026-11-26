// ROUTES: connects each URL + HTTP method of the Services API to a controller function.
// There is no DELETE: services are deactivated, never deleted (appointments refer to them).
import { Router } from "express";
import {
  listServices,
  getService,
  createService,
  updateService,
  updateServiceStatus,
} from "../controllers/serviceController.js";

const router = Router();

router.get("/", listServices); // GET   /api/services
router.get("/:id", getService); // GET   /api/services/:id
router.post("/", createService); // POST  /api/services
router.put("/:id", updateService); // PUT   /api/services/:id
router.patch("/:id/status", updateServiceStatus); // PATCH /api/services/:id/status

export default router;
