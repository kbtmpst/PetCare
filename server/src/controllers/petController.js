// CONTROLLER: handles the HTTP side of the Pets API.
// It reads the request, calls the business layer, and turns the result into an HTTP response.
// It contains no validation rules and no SQL.
import * as petService from "../business/services/petService.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

// Which HTTP status code each kind of failure uses.
const FAILURE_STATUS = { validation: 400, notFound: 404 };

// Sends { status: "error", message, errors? } for a failed result.
function sendFailure(res, result) {
  res.status(FAILURE_STATUS[result.type]).json({
    status: "error",
    message: result.message,
    errors: result.errors, // left out of the JSON when undefined
  });
}

// GET /api/pets            (optional: ?customerId=1 and/or ?search=mochi)
export const listPets = asyncHandler(async (req, res) => {
  const result = await petService.getPetList(req.query);
  if (!result.ok) return sendFailure(res, result);
  res.json({ status: "ok", count: result.pets.length, data: result.pets });
});

// GET /api/pets/:id
export const getPet = asyncHandler(async (req, res) => {
  const result = await petService.getPet(req.params.id);
  if (!result.ok) return sendFailure(res, result);
  res.json({ status: "ok", data: result.pet });
});

// POST /api/pets
export const createPet = asyncHandler(async (req, res) => {
  const result = await petService.createPet(req.body);
  if (!result.ok) return sendFailure(res, result);
  res
    .status(201)
    .location(`/api/pets/${result.pet.id}`)
    .json({ status: "ok", data: result.pet });
});

// PUT /api/pets/:id
export const updatePet = asyncHandler(async (req, res) => {
  const result = await petService.updatePet(req.params.id, req.body);
  if (!result.ok) return sendFailure(res, result);
  res.json({ status: "ok", data: result.pet });
});
