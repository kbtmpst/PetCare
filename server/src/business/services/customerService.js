// BUSINESS LAYER: the rules for customers.
// The controller calls these functions. They use the validator to check the input and the repository
// (data layer) to read and save. Nothing here knows about Express, requests or responses.
//
// Every function returns a result object, never throws for a "normal" problem:
//   { ok: true, ... }                                       it worked
//   { ok: false, type: "validation", message, errors }      the input is wrong        (HTTP 400)
//   { ok: false, type: "notFound", message }                no customer with this id  (HTTP 404)
//
// Note: the customers table does not have a UNIQUE rule on email, so two customers may share an email
// (for example a family using one address). Because of that there is no "duplicate email" error.
import * as customerRepository from "../../data/repositories/customerRepository.js";
import {
  parseId,
  validateCustomerInput,
  validateSearch,
} from "../validators/customerValidator.js";

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
    message: `Customer ${id} was not found.`,
  };
}

// Reads the :id from the URL. Returns { id } or { failure }.
function readId(idText) {
  const id = parseId(idText);
  if (id === null)
    return {
      failure: validationFailure({
        id: "The customer id must be a positive whole number.",
      }),
    };
  return { id };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// All customers. "query" is the URL query (for example { search: "maria" }).
export async function getCustomerList(query) {
  const { errors, search } = validateSearch(query.search);
  if (Object.keys(errors).length > 0) return validationFailure(errors);

  const customers = await customerRepository.getCustomers(search);
  return { ok: true, customers };
}

export async function getCustomer(idText) {
  const { id, failure } = readId(idText);
  if (failure) return failure;

  const customer = await customerRepository.getCustomerById(id);
  if (!customer) return notFound(id);
  return { ok: true, customer };
}

// ---------------------------------------------------------------------------
// Register / edit
// ---------------------------------------------------------------------------

export async function createCustomer(body) {
  const { errors, values } = validateCustomerInput(body);
  if (Object.keys(errors).length > 0) return validationFailure(errors);

  const customer = await customerRepository.createCustomer(values);
  return { ok: true, customer };
}

// Replaces all the customer's details. An email or address that is left out is cleared.
export async function updateCustomer(idText, body) {
  const { id, failure } = readId(idText);
  if (failure) return failure;

  const existing = await customerRepository.getCustomerById(id);
  if (!existing) return notFound(id);

  const { errors, values } = validateCustomerInput(body);
  if (Object.keys(errors).length > 0) return validationFailure(errors);

  const customer = await customerRepository.updateCustomer(id, values);
  return { ok: true, customer };
}
