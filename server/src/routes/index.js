// ROUTES: collects every route group under /api.
// Later you will add customerRoutes, petRoutes, etc. here, one line each.
import { Router } from "express";
import healthRoutes from "./healthRoutes.js";
import serviceRoutes from "./serviceRoutes.js";
import customerRoutes from "./customerRoutes.js";
import petRoutes from "./petRoutes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/services", serviceRoutes);
router.use("/customers", customerRoutes);
router.use("/pets", petRoutes);

export default router;
