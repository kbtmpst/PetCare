// BUSINESS LAYER: the rules for pets.
// The Pets page calls these functions. They use the repositories (data layer) to read and save,
// and the validator to check the form. Nothing here draws anything on screen.
import * as petRepository from "../../data/repositories/petRepository.js";
import * as customerRepository from "../../data/repositories/customerRepository.js";
import * as appointmentRepository from "../../data/repositories/appointmentRepository.js";
import { validatePet } from "../validators/petValidator.js";
import { isOpen } from "./appointmentService.js";
import { pluralize } from "../utils/format.js";

function fullName(customer) {
  return `${customer.firstName} ${customer.lastName}`;
}

// Adds the owner's details to a pet by looking the owner up through pet.customerId.
function withOwner(pet, customers) {
  const owner = customers.find((customer) => customer.id === pet.customerId);
  return {
    ...pet,
    ownerName: owner ? fullName(owner) : "Unknown owner",
    ownerContact: owner ? owner.contactNumber : "",
  };
}

// ---------------------------------------------------------------------------
// Reading data
// ---------------------------------------------------------------------------

// All pets (A-Z by name), each one extended with ownerName and ownerContact.
export async function getPetList() {
  const [pets, customers] = await Promise.all([
    petRepository.getPets(),
    customerRepository.getCustomers(),
  ]);
  return pets
    .map((pet) => withOwner(pet, customers))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The customers shown in the pet form's Owner dropdown (A-Z by name).
export async function getOwnerOptions() {
  const customers = await customerRepository.getCustomers();
  return customers
    .map((customer) => ({
      id: customer.id,
      fullName: fullName(customer),
      contactNumber: customer.contactNumber,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

// The appointments of one pet, newest first. Used for the "Grooming History" in the pet details window.
export async function getPetHistory(petId) {
  const appointments = await appointmentRepository.getAppointments();
  return appointments
    .filter((appointment) => appointment.petId === petId)
    .sort(
      (a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time),
    );
}

// ---------------------------------------------------------------------------
// Calculations for the page
// ---------------------------------------------------------------------------

// The numbers on the summary cards. They are calculated from the list, never typed in by hand.
export function getPetSummary(pets) {
  const countBySpecies = (species) =>
    pets.filter((pet) => pet.species === species).length;
  return {
    total: pets.length,
    dogs: countBySpecies("Dog"),
    cats: countBySpecies("Cat"),
    other: countBySpecies("Other"),
  };
}

// Search by pet name, owner name, breed or pet ID, and filter by species ("" means all species).
export function filterPets(pets, filters) {
  const term = filters.search.trim().toLowerCase();

  return pets.filter((pet) => {
    const matchesSearch =
      term === "" ||
      [pet.name, pet.ownerName, pet.breed, pet.id].some((text) =>
        text.toLowerCase().includes(term),
      );
    const matchesSpecies =
      filters.species === "" || pet.species === filters.species;
    return matchesSearch && matchesSpecies;
  });
}

// ---------------------------------------------------------------------------
// Create / edit / delete
// ---------------------------------------------------------------------------

// Turns the form values into a pet record, or returns { errors } if something is wrong.
async function buildPetRecord(form) {
  const errors = validatePet(form);

  // The owner must be a real customer (the dropdown only offers real ones, but never trust the form).
  if (form.customerId) {
    const owner = await customerRepository.getCustomerById(form.customerId);
    if (!owner) errors.customerId = "That owner could not be found.";
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    record: {
      customerId: form.customerId,
      name: form.name.trim(),
      species: form.species,
      breed: form.breed.trim(),
      birthDate: form.birthDate || "",
      sex: form.sex,
      notes: (form.notes || "").trim(),
    },
  };
}

// Returns { ok: true, pet } or { ok: false, errors }.
export async function createPet(form) {
  const { errors, record } = await buildPetRecord(form);
  if (errors) return { ok: false, errors };

  const pet = await petRepository.createPet(record);
  return { ok: true, pet };
}

// Returns { ok: true, pet } or { ok: false, errors }.
export async function updatePet(id, form) {
  const existing = await petRepository.getPetById(id);
  if (!existing) return { ok: false, errors: { general: "Pet not found." } };

  const { errors, record } = await buildPetRecord(form);
  if (errors) return { ok: false, errors };

  const pet = await petRepository.updatePet(id, record);

  // Rule: if the pet got a new owner, its OPEN appointments (Pending, Confirmed, In Progress) move to the
  // new owner too, so an upcoming appointment never shows a different owner than the pet has.
  // Finished appointments keep the owner they were booked under, as part of the history.
  if (existing.customerId !== record.customerId) {
    const appointments = await appointmentRepository.getAppointments();
    const openAppointments = appointments.filter(
      (appointment) => appointment.petId === id && isOpen(appointment.status),
    );
    for (const appointment of openAppointments) {
      await appointmentRepository.updateAppointment(appointment.id, {
        customerId: record.customerId,
      });
    }
  }

  return { ok: true, pet };
}

// Rule: a pet that has appointments cannot be deleted. Deleting it would leave those appointments pointing
// at a pet that no longer exists, and would erase grooming history and revenue records.
// Returns { allowed: true } or { allowed: false, reason: "message to show the user" }.
export async function checkPetDeletion(id) {
  const pet = await petRepository.getPetById(id);
  if (!pet) return { allowed: false, reason: "Pet not found." };

  const appointments = (await appointmentRepository.getAppointments()).filter(
    (appointment) => appointment.petId === id,
  );

  if (appointments.length > 0) {
    const openCount = appointments.filter((appointment) =>
      isOpen(appointment.status),
    ).length;
    const openText = openCount > 0 ? ` (${openCount} still open)` : "";
    return {
      allowed: false,
      reason: `${pet.name} cannot be deleted because it has ${pluralize(
        appointments.length,
        "appointment record",
      )}${openText}. Pets with appointment history are kept so past appointments and revenue stay accurate.`,
    };
  }
  return { allowed: true };
}

// Returns { ok: true } or { ok: false, error: "message" }.
export async function deletePet(id) {
  const check = await checkPetDeletion(id); // always re-check, even if the page already did
  if (!check.allowed) return { ok: false, error: check.reason };

  await petRepository.deletePet(id);
  return { ok: true };
}
