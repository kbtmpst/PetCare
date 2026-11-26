// MIDDLEWARE (wiring): the real "own pet" check. It plugs the real database lookup into
// createRequireOwnPetOrRole.js.
import { createRequireOwnPetOrRole } from "./createRequireOwnPetOrRole.js";
import { getPetOwnerId } from "../data/repositories/petRepository.js";

export const requireOwnPetOrRole = createRequireOwnPetOrRole({
  findPetOwnerId: getPetOwnerId,
});
