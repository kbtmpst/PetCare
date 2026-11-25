// DATA LAYER: the only place that knows where transactions (payments) are stored.
//
// Every transaction has an appointmentId that points to its appointment in the appointment repository.
// For now transactions live in a JavaScript array in memory (reset when the browser is refreshed).
// Later each function becomes a fetch() call to the Express API (for example fetch("/api/transactions")).
import { transactions as sampleTransactions } from "../mock/sampleData.js";
import { createIdGenerator } from "../database/idGenerator.js";

// A copy of the sample data, so editing here never changes the original sample file.
let transactions = sampleTransactions.map((transaction) => ({
  ...transaction,
}));
const nextId = createIdGenerator("TRX", transactions); // "TRX-006", "TRX-007", ...

// READ: all transactions (copies, so other code cannot change our stored data by accident).
export async function getTransactions() {
  return transactions.map((transaction) => ({ ...transaction }));
}

// READ: one transaction, or null if there is no transaction with that id.
export async function getTransactionById(id) {
  const transaction = transactions.find((item) => item.id === id);
  return transaction ? { ...transaction } : null;
}

// CREATE: save a new transaction and return it (with its new id).
export async function createTransaction(data) {
  const newTransaction = { ...data, id: nextId() };
  transactions = [...transactions, newTransaction];
  return { ...newTransaction };
}

// UPDATE: change some fields of one transaction. Returns the updated transaction, or null if not found.
export async function updateTransaction(id, changes) {
  const existing = transactions.find((transaction) => transaction.id === id);
  if (!existing) return null;

  const updated = { ...existing, ...changes, id }; // the id can never change
  transactions = transactions.map((transaction) =>
    transaction.id === id ? updated : transaction,
  );
  return { ...updated };
}
