// ROUTES: connects each URL + HTTP method of the authentication API to a controller function.
import { Router } from "express";
import {
  register,
  login,
  me,
  changePassword,
} from "../controllers/authController.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// Answers with tokens and account data must never be saved by a browser or a proxy.
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.post("/register", register); // POST /api/auth/register         (public)
router.post("/login", login); // POST /api/auth/login                   (public)
router.get("/me", authenticate, me); // GET  /api/auth/me               (logged in)
router.post("/change-password", authenticate, changePassword); // POST /api/auth/change-password (logged in)

export default router;
