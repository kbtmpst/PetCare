// BUSINESS LAYER: checks the pet form values.
// Returns an object of error messages, for example { name: "Pet name is required." }.
// An empty object {} means the form is valid.
import { toISODate } from "../utils/format.js";

// The allowed choices. The form dropdowns and the validation both use these lists.
export const PET_SPECIES = ["Dog", "Cat", "Other"];
export const PET_SEXES = ["Male", "Female"];

export function validatePet(form) {
  const errors = {};

  const name = (form.name || "").trim();
  const breed = (form.breed || "").trim();

  if (!name) {
    errors.name = "Pet name is required.";
  } else if (name.length > 50) {
    errors.name = "Pet name must be 50 characters or fewer.";
  }

  if (!form.customerId) {
    errors.customerId = "Please select the pet's owner.";
  }

  if (!PET_SPECIES.includes(form.species)) {
    errors.species = "Please select a species.";
  }

  if (!breed) {
    errors.breed = 'Breed is required (type "Mixed breed" if unknown).';
  } else if (breed.length > 50) {
    errors.breed = "Breed must be 50 characters or fewer.";
  }

  // Date of birth is optional, but it cannot be in the future.
  if (form.birthDate && form.birthDate > toISODate()) {
    errors.birthDate = "Date of birth cannot be in the future.";
  }

  if (!PET_SEXES.includes(form.sex)) {
    errors.sex = "Please select the sex.";
  }

  if (form.notes && form.notes.length > 300) {
    errors.notes = "Notes must be 300 characters or fewer.";
  }

  return errors;
}
