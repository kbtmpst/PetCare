// CONTROLLER: handles the HTTP side of the Customers API.
// It reads the request, calls the business layer, and turns the result into an HTTP response.
// It contains no validation rules and no SQL.
import * as customerService from "../business/services/customerService.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

// Which HTTP status code each kind of failure uses.
const FAILURE_STATUS = { validation: 400, notFound: 404 };

// Sends { status: "error", message, errors? } for a failed result.
function sendFailure(res, result) {
  res.status(FAILURE_STATUS[result.type]).json({
    status: "error",
    message: result.message,
    errors: result.errors, // left out of the JSON when undefined
  });
}

// GET /api/customers            (optional: ?search=maria)
export const listCustomers = asyncHandler(async (req, res) => {
  const result = await customerService.getCustomerList(req.query);
  if (!result.ok) return sendFailure(res, result);
  res.json({
    status: "ok",
    count: result.customers.length,
    data: result.customers,
  });
});

// GET /api/customers/:id
export const getCustomer = asyncHandler(async (req, res) => {
  const result = await customerService.getCustomer(req.params.id);
  if (!result.ok) return sendFailure(res, result);
  res.json({ status: "ok", data: result.customer });
});

// POST /api/customers
export const createCustomer = asyncHandler(async (req, res) => {
  const result = await customerService.createCustomer(req.body);
  if (!result.ok) return sendFailure(res, result);
  res
    .status(201)
    .location(`/api/customers/${result.customer.id}`)
    .json({ status: "ok", data: result.customer });
});

// PUT /api/customers/:id
export const updateCustomer = asyncHandler(async (req, res) => {
  const result = await customerService.updateCustomer(req.params.id, req.body);
  if (!result.ok) return sendFailure(res, result);
  res.json({ status: "ok", data: result.customer });
});
