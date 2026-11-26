// ROUTES: connects each URL + HTTP method of the Pets API to a controller function.
// There is no DELETE: pets are kept so their appointment history is preserved.
import { Router } from "express";
import {
  listPets,
  getPet,
  createPet,
  updatePet,
} from "../controllers/petController.js";

const router = Router();

router.get("/", listPets); // GET   /api/pets
router.get("/:id", getPet); // GET   /api/pets/:id
router.post("/", createPet); // POST  /api/pets
router.put("/:id", updatePet); // PUT   /api/pets/:id

export default router;
