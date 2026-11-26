// BUSINESS LAYER: the rules for services.
// The controller calls these functions. They use the validator to check the input and the repository
// (data layer) to read and save. Nothing here knows about Express, requests or responses.
//
// Every function returns a result object, never throws for a "normal" problem:
//   { ok: true, ... }                                       it worked
//   { ok: false, type: "validation", message, errors }      the input is wrong        (HTTP 400)
//   { ok: false, type: "notFound", message }                no service with this id   (HTTP 404)
//   { ok: false, type: "conflict", message, errors }        the name is already used  (HTTP 409)
import * as serviceRepository from "../../data/repositories/serviceRepository.js";
import {
  parseId,
  validateServiceInput,
  validateStatusInput,
  validateActiveFilter,
} from "../validators/serviceValidator.js";

function validationFailure(errors) {
  return {
    ok: false,
    type: "validation",
    message: "Validation failed. Please check the fields.",
    errors,
  };
}

function notFound(id) {
  return {
    ok: false,
    type: "notFound",
    message: `Service ${id} was not found.`,
  };
}

function nameTaken() {
  return {
    ok: false,
    type: "conflict",
    message: "A service with this name already exists.",
    errors: { name: "A service with this name already exists." },
  };
}

// Reads the :id from the URL. Returns { id } or { failure }.
function readId(idText) {
  const id = parseId(idText);
  if (id === null)
    return {
      failure: validationFailure({
        id: "The service id must be a positive whole number.",
      }),
    };
  return { id };
}

// Rule: two services cannot have the same name (capital letters do not matter).
// "ignoreId" is the service being edited, so it is not compared with itself.
async function isNameTaken(name, ignoreId) {
  const existingId = await serviceRepository.findServiceIdByName(name);
  return existingId !== null && existingId !== ignoreId;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// All services. "query" is the URL query (for example { active: "true" }).
export async function getServiceList(query) {
  const { errors, active } = validateActiveFilter(query.active);
  if (Object.keys(errors).length > 0) return validationFailure(errors);

  const services = await serviceRepository.getServices(active);
  return { ok: true, services };
}

export async function getService(idText) {
  const { id, failure } = readId(idText);
  if (failure) return failure;

  const service = await serviceRepository.getServiceById(id);
  if (!service) return notFound(id);
  return { ok: true, service };
}

// ---------------------------------------------------------------------------
// Create / edit / activate
// ---------------------------------------------------------------------------

// A new service is active unless the request says active: false.
export async function createService(body) {
  const { errors, values } = validateServiceInput(body);
  if (Object.keys(errors).length > 0) return validationFailure(errors);

  if (await isNameTaken(values.name, null)) return nameTaken();

  try {
    const service = await serviceRepository.createService({
      ...values,
      active: values.active ?? true,
    });
    return { ok: true, service };
  } catch (error) {
    // Two requests with the same new name at the same moment: the database UNIQUE rule catches the second one.
    if (error.code === "ER_DUP_ENTRY") return nameTaken();
    throw error;
  }
}

// Replaces name, description, price and duration. "active" is only changed when the request includes it.
export async function updateService(idText, body) {
  const { id, failure } = readId(idText);
  if (failure) return failure;

  const existing = await serviceRepository.getServiceById(id);
  if (!existing) return notFound(id);

  const { errors, values } = validateServiceInput(body);
  if (Object.keys(errors).length > 0) return validationFailure(errors);

  if (await isNameTaken(values.name, id)) return nameTaken();

  try {
    const service = await serviceRepository.updateService(id, {
      ...values,
      active: values.active ?? existing.active,
    });
    return { ok: true, service };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return nameTaken();
    throw error;
  }
}

// Activate or deactivate. Services are never deleted: appointments and transactions refer to them,
// so an inactive service simply cannot be booked any more, while old appointments stay valid.
export async function setServiceActive(idText, body) {
  const { id, failure } = readId(idText);
  if (failure) return failure;

  const { errors, active } = validateStatusInput(body);
  if (Object.keys(errors).length > 0) return validationFailure(errors);

  const existing = await serviceRepository.getServiceById(id);
  if (!existing) return notFound(id);

  const service = await serviceRepository.setServiceActive(id, active);
  return { ok: true, service };
}
