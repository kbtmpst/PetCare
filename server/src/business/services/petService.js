// BUSINESS LAYER: the rules for pets.
// The controller calls these functions. They use the validator to check the input and the repositories
// (data layer) to read and save. Nothing here knows about Express, requests or responses.
//
// Every function returns a result object, never throws for a "normal" problem:
//   { ok: true, ... }                                       it worked
//   { ok: false, type: "validation", message, errors }      the input is wrong          (HTTP 400)
//   { ok: false, type: "notFound", message, errors? }       the pet or its owner is missing (HTTP 404)
//
// Rules:
//   - every pet belongs to one existing customer (its owner)
//   - pets are never deleted: appointments refer to them and keep the history
import * as petRepository from "../../data/repositories/petRepository.js";
import * as customerRepository from "../../data/repositories/customerRepository.js";
import { config } from "../../config/env.js";
import {
  parseId,
  validatePetInput,
  validatePetFilters,
} from "../validators/petValidator.js";

function validationFailure(errors) {
  return {
    ok: false,
    type: "validation",
    message: "Validation failed. Please check the fields.",
    errors,
  };
}

function petNotFound(id) {
  return { ok: false, type: "notFound", message: `Pet ${id} was not found.` };
}

// The pet exists, but the owner named in the request does not.
function ownerNotFound(customerId) {
  return {
    ok: false,
    type: "notFound",
    message: `Customer ${customerId} was not found.`,
    errors: { customerId: "The selected owner does not exist." },
  };
}

// Reads the :id from the URL. Returns { id } or { failure }.
function readId(idText) {
  const id = parseId(idText);
  if (id === null)
    return {
      failure: validationFailure({
        id: "The pet id must be a positive whole number.",
      }),
    };
  return { id };
}

// Today's date ("YYYY-MM-DD") in the database time zone from server/.env (DB_TIMEZONE, for example +08:00),
// so a birth date is compared with the same "today" as the database uses.
function todayInServerTimeZone() {
  const [, sign, hours, minutes] = /^([+-])(\d{2}):(\d{2})$/.exec(
    config.db.timezone,
  );
  const offsetMinutes =
    (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
  return new Date(Date.now() + offsetMinutes * 60000)
    .toISOString()
    .slice(0, 10);
}

// True when the database has a customer with this id.
async function ownerExists(customerId) {
  return (await customerRepository.getCustomerById(customerId)) !== null;
}

// The database foreign key is the safety net if the owner is removed at the same moment as the save.
function isMissingOwnerError(error) {
  return error.code === "ER_NO_REFERENCED_ROW_2";
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// All pets. "query" is the URL query (for example { customerId: "1", search: "mo" }).
// A customerId with no pets (or no such customer) simply gives an empty list.
export async function getPetList(query) {
  const { errors, customerId, search } = validatePetFilters(query);
  if (Object.keys(errors).length > 0) return validationFailure(errors);

  const pets = await petRepository.getPets({ customerId, search });
  return { ok: true, pets };
}

export async function getPet(idText) {
  const { id, failure } = readId(idText);
  if (failure) return failure;

  const pet = await petRepository.getPetById(id);
  if (!pet) return petNotFound(id);
  return { ok: true, pet };
}

// ---------------------------------------------------------------------------
// Register / edit
// ---------------------------------------------------------------------------

export async function createPet(body) {
  const { errors, values } = validatePetInput(body, todayInServerTimeZone());
  if (Object.keys(errors).length > 0) return validationFailure(errors);

  if (!(await ownerExists(values.customerId)))
    return ownerNotFound(values.customerId);

  try {
    const pet = await petRepository.createPet(values);
    return { ok: true, pet };
  } catch (error) {
    if (isMissingOwnerError(error)) return ownerNotFound(values.customerId);
    throw error;
  }
}

// Replaces all the pet's details (an empty birth date or notes is cleared). The owner can be changed:
// old appointments keep the owner they were booked with.
export async function updatePet(idText, body) {
  const { id, failure } = readId(idText);
  if (failure) return failure;

  const existing = await petRepository.getPetById(id);
  if (!existing) return petNotFound(id);

  const { errors, values } = validatePetInput(body, todayInServerTimeZone());
  if (Object.keys(errors).length > 0) return validationFailure(errors);

  if (!(await ownerExists(values.customerId)))
    return ownerNotFound(values.customerId);

  try {
    const pet = await petRepository.updatePet(id, values);
    return { ok: true, pet };
  } catch (error) {
    if (isMissingOwnerError(error)) return ownerNotFound(values.customerId);
    throw error;
  }
}
