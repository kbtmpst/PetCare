// BUSINESS LAYER: checks the "Mark as Paid" form.
// Returns an object of error messages, for example { paymentMethod: "Please select a payment method." }.
// An empty object {} means the form is valid.

// The allowed choices. The form dropdown, the filters and the validation all use these lists.
export const PAYMENT_METHODS = ["Cash", "GCash", "Card"];
export const TRANSACTION_STATUSES = ["Paid", "Pending", "Refunded"];

export function validatePayment(form) {
  const errors = {};

  if (!PAYMENT_METHODS.includes(form.paymentMethod)) {
    errors.paymentMethod = "Please select a payment method.";
  }

  return errors;
}
