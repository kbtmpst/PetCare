// CONTROLLER: handles the HTTP side of the Services API.
// It reads the request, calls the business layer, and turns the result into an HTTP response.
// It contains no validation rules and no SQL.
import * as serviceService from "../business/services/serviceService.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

// Which HTTP status code each kind of failure uses.
const FAILURE_STATUS = { validation: 400, notFound: 404, conflict: 409 };

// Sends { status: "error", message, errors? } for a failed result.
function sendFailure(res, result) {
  res.status(FAILURE_STATUS[result.type]).json({
    status: "error",
    message: result.message,
    errors: result.errors, // left out of the JSON when undefined
  });
}

// GET /api/services            (optional: ?active=true or ?active=false)
export const listServices = asyncHandler(async (req, res) => {
  const result = await serviceService.getServiceList(req.query);
  if (!result.ok) return sendFailure(res, result);
  res.json({
    status: "ok",
    count: result.services.length,
    data: result.services,
  });
});

// GET /api/services/:id
export const getService = asyncHandler(async (req, res) => {
  const result = await serviceService.getService(req.params.id);
  if (!result.ok) return sendFailure(res, result);
  res.json({ status: "ok", data: result.service });
});

// POST /api/services
export const createService = asyncHandler(async (req, res) => {
  const result = await serviceService.createService(req.body);
  if (!result.ok) return sendFailure(res, result);
  res
    .status(201)
    .location(`/api/services/${result.service.id}`)
    .json({ status: "ok", data: result.service });
});

// PUT /api/services/:id
export const updateService = asyncHandler(async (req, res) => {
  const result = await serviceService.updateService(req.params.id, req.body);
  if (!result.ok) return sendFailure(res, result);
  res.json({ status: "ok", data: result.service });
});

// PATCH /api/services/:id/status
export const updateServiceStatus = asyncHandler(async (req, res) => {
  const result = await serviceService.setServiceActive(req.params.id, req.body);
  if (!result.ok) return sendFailure(res, result);
  res.json({ status: "ok", data: result.service });
});
