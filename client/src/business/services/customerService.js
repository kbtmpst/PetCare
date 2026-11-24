// BUSINESS LAYER: the rules for customers.
// The Customers page calls these functions. They use the repositories (data layer) to read and save,
// and the validator to check the form. Nothing here draws anything on screen.
import * as customerRepository from "../../data/repositories/customerRepository.js";
import * as petRepository from "../../data/repositories/petRepository.js";
import * as appointmentRepository from "../../data/repositories/appointmentRepository.js";
import { validateCustomer } from "../validators/customerValidator.js";
import { pluralize, toISODate } from "../utils/format.js";

export const CUSTOMER_SORT_OPTIONS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "newest", label: "Newest registered" },
  { value: "pets", label: "Most pets" },
];

// ---------------------------------------------------------------------------
// Reading data
// ---------------------------------------------------------------------------

// All customers, each one extended with:
//   fullName  "Maria Santos"
//   pets      the pets whose customerId matches this customer's id  <- this is the relationship
//   petCount  how many pets that is
export async function getCustomerList() {
  const [customers, pets] = await Promise.all([
    customerRepository.getCustomers(),
    petRepository.getPets(),
  ]);

  return customers.map((customer) => {
    const ownedPets = pets.filter((pet) => pet.customerId === customer.id);
    return {
      ...customer,
      fullName: `${customer.firstName} ${customer.lastName}`,
      pets: ownedPets,
      petCount: ownedPets.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Calculations for the page
// ---------------------------------------------------------------------------

// The numbers on the summary cards. They are calculated from the list, never typed in by hand.
export function getCustomerSummary(customers) {
  const thisMonth = toISODate().slice(0, 7); // "2026-11"

  return {
    total: customers.length,
    newThisMonth: customers.filter(
      (c) => c.dateRegistered.slice(0, 7) === thisMonth,
    ).length,
    withPets: customers.filter((c) => c.petCount > 0).length,
    // Every pet must belong to a customer (the pet form requires an owner), so adding up each
    // customer's pets gives the exact number of registered pets.
    totalPets: customers.reduce((sum, c) => sum + c.petCount, 0),
  };
}

// Keeps only the digits and "+" of a phone number: "0917 123-4567" -> "09171234567".
function keepDigits(text) {
  return text.replace(/[^\d+]/g, "");
}

// Search by name, customer ID or contact number.
// A phone search ignores spaces and dashes, so "0917123" finds "0917 123 4567".
export function filterCustomers(customers, search) {
  const term = search.trim().toLowerCase();
  if (term === "") return customers;

  const looksLikePhoneNumber = /^[\d\s+\-().]+$/.test(term);
  const digitsTerm = keepDigits(term);

  return customers.filter((customer) => {
    const matchesName = customer.fullName.toLowerCase().includes(term);
    const matchesId = customer.id.toLowerCase().includes(term);
    const matchesPhone =
      looksLikePhoneNumber &&
      digitsTerm !== "" &&
      keepDigits(customer.contactNumber).includes(digitsTerm);
    return matchesName || matchesId || matchesPhone;
  });
}

// Returns a sorted copy of the list. sortBy is one of the "value"s in CUSTOMER_SORT_OPTIONS.
export function sortCustomers(customers, sortBy) {
  const sorted = [...customers];
  const byName = (a, b) => a.fullName.localeCompare(b.fullName);

  if (sortBy === "newest") {
    sorted.sort(
      (a, b) =>
        b.dateRegistered.localeCompare(a.dateRegistered) || byName(a, b),
    );
  } else if (sortBy === "pets") {
    sorted.sort((a, b) => b.petCount - a.petCount || byName(a, b));
  } else {
    sorted.sort(byName);
  }
  return sorted;
}

// ---------------------------------------------------------------------------
// Create / edit / delete
// ---------------------------------------------------------------------------

// Turns the form values into the fields we store (trimmed, email in lowercase).
function toCustomerFields(form) {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    contactNumber: form.contactNumber.trim(),
    email: (form.email || "").trim().toLowerCase(),
    address: (form.address || "").trim(),
  };
}

// Returns { ok: true, customer } or { ok: false, errors }.
export async function createCustomer(form) {
  const errors = validateCustomer(form);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // A new customer is registered today.
  const customer = await customerRepository.createCustomer({
    ...toCustomerFields(form),
    dateRegistered: toISODate(),
  });
  return { ok: true, customer };
}

// Returns { ok: true, customer } or { ok: false, errors }.
export async function updateCustomer(id, form) {
  const existing = await customerRepository.getCustomerById(id);
  if (!existing)
    return { ok: false, errors: { general: "Customer not found." } };

  const errors = validateCustomer(form);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const customer = await customerRepository.updateCustomer(
    id,
    toCustomerFields(form),
  );
  return { ok: true, customer };
}

// Rules: a customer cannot be deleted while
//   1. they still have registered pets (those pets would be left without an owner), or
//   2. appointment records still point to them (an old appointment would show "Unknown owner").
//      This can happen even with no pets left: if a pet is moved to a new owner, its finished
//      appointments keep the original owner as history.
// Returns { allowed: true } or { allowed: false, reason: "message to show the user" }.
export async function checkCustomerDeletion(id) {
  const customer = await customerRepository.getCustomerById(id);
  if (!customer) return { allowed: false, reason: "Customer not found." };

  const pets = (await petRepository.getPets()).filter(
    (pet) => pet.customerId === id,
  );
  if (pets.length > 0) {
    const names = pets.map((pet) => pet.name).join(", ");
    return {
      allowed: false,
      reason: `${customer.firstName} ${customer.lastName} cannot be deleted because ${pluralize(
        pets.length,
        "pet",
      )} still belong${pets.length === 1 ? "s" : ""} to this customer (${names}). Delete those pets or move them to another owner first.`,
    };
  }

  const appointments = (await appointmentRepository.getAppointments()).filter(
    (appointment) => appointment.customerId === id,
  );
  if (appointments.length > 0) {
    return {
      allowed: false,
      reason: `${customer.firstName} ${customer.lastName} cannot be deleted because ${pluralize(
        appointments.length,
        "appointment record",
      )} ${appointments.length === 1 ? "is" : "are"} linked to this customer. Customers with appointment history are kept so past appointments and revenue stay accurate.`,
    };
  }
  return { allowed: true };
}

// Returns { ok: true } or { ok: false, error: "message" }.
export async function deleteCustomer(id) {
  const check = await checkCustomerDeletion(id); // always re-check, even if the page already did
  if (!check.allowed) return { ok: false, error: check.reason };

  await customerRepository.deleteCustomer(id);
  return { ok: true };
}
