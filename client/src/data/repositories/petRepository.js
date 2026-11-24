// DATA LAYER: the only place that knows where pets are stored.
//
// Every pet has a customerId that points to its owner in the customer repository.
// For now pets live in a JavaScript array in memory (reset when the browser is refreshed).
// Later each function becomes a fetch() call to the Express API.
import { pets as samplePets } from "../mock/sampleData.js";
import { createIdGenerator } from "../database/idGenerator.js";

// A copy of the sample data, so editing here never changes the original sample file.
let pets = samplePets.map((pet) => ({ ...pet }));
const nextId = createIdGenerator("PET", pets);

// READ: all pets.
export async function getPets() {
  return pets.map((pet) => ({ ...pet }));
}

// READ: one pet, or null if there is no pet with that id.
export async function getPetById(id) {
  const pet = pets.find((item) => item.id === id);
  return pet ? { ...pet } : null;
}

// CREATE: save a new pet and return it (with its new id).
export async function createPet(data) {
  const newPet = { ...data, id: nextId() };
  pets = [...pets, newPet];
  return { ...newPet };
}

// UPDATE: change some fields of one pet. Returns the updated pet, or null if not found.
export async function updatePet(id, changes) {
  const existing = pets.find((pet) => pet.id === id);
  if (!existing) return null;

  const updated = { ...existing, ...changes, id }; // the id can never change
  pets = pets.map((pet) => (pet.id === id ? updated : pet));
  return { ...updated };
}

// DELETE: remove one pet. Returns true if something was deleted.
// (The business layer decides WHETHER a pet may be deleted. This function just does it.)
export async function deletePet(id) {
  const exists = pets.some((pet) => pet.id === id);
  pets = pets.filter((pet) => pet.id !== id);
  return exists;
}
