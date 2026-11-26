// ROUTES: connects a URL to a controller function.
import { Router } from "express";
import { checkHealth } from "../controllers/healthController.js";

const router = Router();

router.get("/", checkHealth); // GET /api/health

export default router;
