// BUSINESS LAYER: the rules for transactions (payments).
// The Transactions page and the Dashboard call these functions. They use the repositories (data layer)
// to read and save, and the validator to check the form. Nothing here draws anything on screen.
//
// A transaction only stores an appointmentId. The customer, pet and service are looked up through it:
//   transaction.appointmentId -> appointment.petId      -> pet
//                             -> appointment.customerId -> customer
//                             -> appointment.service    (the service name the appointment was booked with)
import * as transactionRepository from "../../data/repositories/transactionRepository.js";
import * as appointmentRepository from "../../data/repositories/appointmentRepository.js";
import * as petRepository from "../../data/repositories/petRepository.js";
import * as customerRepository from "../../data/repositories/customerRepository.js";
import { validatePayment } from "../validators/transactionValidator.js";
import { toISODate } from "../utils/format.js";

// ---------------------------------------------------------------------------
// Status rules
// ---------------------------------------------------------------------------

// Only a Pending payment can be marked as paid.
export function canMarkPaid(status) {
  return status === "Pending";
}

// Only a Paid payment can be refunded. (Pending means nothing was paid yet; Refunded is already final.)
export function canRefund(status) {
  return status === "Paid";
}

// ---------------------------------------------------------------------------
// Reading data
// ---------------------------------------------------------------------------

// All transactions, newest first, each one extended with:
//   customer, pet, species, service   looked up through the appointment (with a safe fallback if missing)
export async function getTransactionList() {
  const [transactions, appointments, pets, customers] = await Promise.all([
    transactionRepository.getTransactions(),
    appointmentRepository.getAppointments(),
    petRepository.getPets(),
    customerRepository.getCustomers(),
  ]);

  return transactions
    .map((transaction) => {
      const appointment = appointments.find(
        (item) => item.id === transaction.appointmentId,
      );
      const pet = appointment
        ? pets.find((item) => item.id === appointment.petId)
        : null;
      const customer = appointment
        ? customers.find((item) => item.id === appointment.customerId)
        : null;
      return {
        ...transaction,
        customer: customer
          ? `${customer.firstName} ${customer.lastName}`
          : "Unknown owner",
        pet: pet ? pet.name : "Unknown pet",
        species: pet ? pet.species : "Unknown",
        service: appointment ? appointment.service : "Unknown service",
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

// Revenue = the amount of PAID transactions. Pending payments are not revenue yet, and refunded
// payments were given back. The Dashboard uses this too, so there is only one definition of "revenue".
// Returns { totalRevenue, todayRevenue } (todayRevenue = paid today).
export async function getRevenueFigures() {
  const transactions = await transactionRepository.getTransactions();
  const today = toISODate();
  const paid = transactions.filter(
    (transaction) => transaction.status === "Paid",
  );

  return {
    totalRevenue: paid.reduce(
      (sum, transaction) => sum + transaction.amount,
      0,
    ),
    todayRevenue: paid
      .filter((transaction) => transaction.paidDate === today)
      .reduce((sum, transaction) => sum + transaction.amount, 0),
  };
}

// ---------------------------------------------------------------------------
// Calculations for the page
// ---------------------------------------------------------------------------

// The numbers on the summary cards. They are calculated from the list, never typed in by hand.
export function getTransactionSummary(transactions) {
  const sumOf = (status) =>
    transactions
      .filter((t) => t.status === status)
      .reduce((sum, t) => sum + t.amount, 0);
  const countOf = (status) =>
    transactions.filter((t) => t.status === status).length;

  return {
    totalRevenue: sumOf("Paid"),
    totalTransactions: transactions.length,
    pendingCount: countOf("Pending"),
    pendingAmount: sumOf("Pending"),
    refundedCount: countOf("Refunded"),
    refundedAmount: sumOf("Refunded"),
  };
}

// Search by transaction ID, appointment ID, customer, pet or service. Filter by status and by date.
// An empty filter means "do not filter by this".
export function filterTransactions(transactions, filters) {
  const term = filters.search.trim().toLowerCase();

  return transactions.filter((transaction) => {
    const matchesSearch =
      term === "" ||
      [
        transaction.id,
        transaction.appointmentId,
        transaction.customer,
        transaction.pet,
        transaction.service,
      ].some((text) => text.toLowerCase().includes(term));
    const matchesStatus =
      filters.status === "" || transaction.status === filters.status;
    const matchesDate =
      filters.date === "" || transaction.date === filters.date;

    return matchesSearch && matchesStatus && matchesDate;
  });
}

// ---------------------------------------------------------------------------
// Changing a transaction
// ---------------------------------------------------------------------------

// Pending -> Paid. The form only holds the payment method.
// Returns { ok: true, transaction } or { ok: false, errors } (form problems) or { ok: false, error } (rule problems).
export async function markTransactionPaid(id, form) {
  const existing = await transactionRepository.getTransactionById(id);
  if (!existing) return { ok: false, error: "Transaction not found." };
  if (!canMarkPaid(existing.status)) {
    return {
      ok: false,
      error: `A ${existing.status} transaction cannot be marked as paid.`,
    };
  }

  const errors = validatePayment(form);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const transaction = await transactionRepository.updateTransaction(id, {
    status: "Paid",
    paymentMethod: form.paymentMethod,
    paidDate: toISODate(),
  });
  return { ok: true, transaction };
}

// Rule: only a Paid transaction can be refunded.
// Returns { allowed: true } or { allowed: false, reason: "message to show the user" }.
export async function checkRefund(id) {
  const transaction = await transactionRepository.getTransactionById(id);
  if (!transaction) return { allowed: false, reason: "Transaction not found." };

  if (!canRefund(transaction.status)) {
    const reason =
      transaction.status === "Pending"
        ? `${transaction.id} is still pending, so nothing was paid and there is nothing to refund.`
        : `${transaction.id} was already refunded.`;
    return { allowed: false, reason };
  }
  return { allowed: true };
}

// Paid -> Refunded. Returns { ok: true, transaction } or { ok: false, error: "message" }.
export async function refundTransaction(id) {
  const check = await checkRefund(id); // always re-check, even if the page already did
  if (!check.allowed) return { ok: false, error: check.reason };

  const transaction = await transactionRepository.updateTransaction(id, {
    status: "Refunded",
  });
  return { ok: true, transaction };
}
