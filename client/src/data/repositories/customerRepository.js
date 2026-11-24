// DATA LAYER: the only place that knows where customers are stored.
//
// For now customers live in a JavaScript array in memory, so add / edit / delete work while the app is
// open. Refreshing the browser resets them to the sample data. Later each function becomes a fetch()
// call to the Express API (for example fetch("/api/customers")); the business layer will not notice.
import { customers as sampleCustomers } from "../mock/sampleData.js";
import { createIdGenerator } from "../database/idGenerator.js";

// A copy of the sample data, so editing here never changes the original sample file.
let customers = sampleCustomers.map((customer) => ({ ...customer }));
const nextId = createIdGenerator("CUS", customers);

// READ: all customers (copies, so other code cannot change our stored data by accident).
export async function getCustomers() {
  return customers.map((customer) => ({ ...customer }));
}

// READ: one customer, or null if there is no customer with that id.
export async function getCustomerById(id) {
  const customer = customers.find((item) => item.id === id);
  return customer ? { ...customer } : null;
}

// CREATE: save a new customer and return it (with its new id).
export async function createCustomer(data) {
  const newCustomer = { ...data, id: nextId() };
  customers = [...customers, newCustomer];
  return { ...newCustomer };
}

// UPDATE: change some fields of one customer. Returns the updated customer, or null if not found.
export async function updateCustomer(id, changes) {
  const existing = customers.find((customer) => customer.id === id);
  if (!existing) return null;

  const updated = { ...existing, ...changes, id }; // the id can never change
  customers = customers.map((customer) =>
    customer.id === id ? updated : customer,
  );
  return { ...updated };
}

// DELETE: remove one customer. Returns true if something was deleted.
// (The business layer decides WHETHER a customer may be deleted. This function just does it.)
export async function deleteCustomer(id) {
  const exists = customers.some((customer) => customer.id === id);
  customers = customers.filter((customer) => customer.id !== id);
  return exists;
}
