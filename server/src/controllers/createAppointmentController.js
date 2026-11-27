// CONTROLLER (logic): handles the HTTP side of the Appointments API.
// It reads the request, calls the business layer, and turns the result into an HTTP response.
// It contains no validation rules, no ownership rules and no SQL: the business layer decides all of that.
// The business service is handed in, so the tests can use a fake (no MySQL).
// appointmentController.js plugs in the real one.
import { asyncHandler } from "../middleware/asyncHandler.js";

// Which HTTP status code each kind of failure uses.
const FAILURE_STATUS = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
};

// Who is making the request. It comes ONLY from req.user, which the authenticate middleware filled in from the
// database. It never comes from the request body, query or URL, so a caller cannot pretend to be someone else.
function actorFrom(req) {
  return { role: req.user.role, customerId: req.user.customerId ?? null };
}

// Sends { status: "error", message, errors? } for a failed result.
function sendFailure(res, result) {
  const httpStatus = FAILURE_STATUS[result.type];
  // A failure type nobody planned for is a bug. Stop loudly (the error handler answers 500)
  // instead of sending a strange status code.
  if (httpStatus === undefined)
    throw new Error(`Unknown appointment failure type: ${result.type}`);
  res.status(httpStatus).json({
    status: "error",
    message: result.message,
    errors: result.errors, // left out of the JSON when undefined
  });
}

// deps = { service } with getAppointmentList, getAppointment, createAppointment, updateAppointment, changeAppointmentStatus
export function createAppointmentController({ service }) {
  // Every handler first makes sure there is a logged-in user. The routes already guarantee this (authenticate runs first),
  // so this is a second lock on the same door, and it never reaches the business layer without an actor.
  function withActor(handler) {
    return asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({
            status: "error",
            message: "Authentication required. Please log in.",
          });
      }
      return handler(req, res, actorFrom(req));
    });
  }

  // GET /api/appointments        (optional: ?status= &date= &petId= &customerId=)
  const listAppointments = withActor(async (req, res, actor) => {
    const result = await service.getAppointmentList(req.query, actor);
    if (!result.ok) return sendFailure(res, result);
    res.json({
      status: "ok",
      count: result.appointments.length,
      data: result.appointments,
    });
  });

  // GET /api/appointments/:id
  const getAppointment = withActor(async (req, res, actor) => {
    const result = await service.getAppointment(req.params.id, actor);
    if (!result.ok) return sendFailure(res, result);
    res.json({ status: "ok", data: result.appointment });
  });

  // POST /api/appointments
  const createAppointment = withActor(async (req, res, actor) => {
    const result = await service.createAppointment(req.body, actor);
    if (!result.ok) return sendFailure(res, result);
    res
      .status(201)
      .location(`/api/appointments/${result.appointment.id}`)
      .json({ status: "ok", data: result.appointment });
  });

  // PUT /api/appointments/:id   (edit / reschedule)
  const updateAppointment = withActor(async (req, res, actor) => {
    const result = await service.updateAppointment(
      req.params.id,
      req.body,
      actor,
    );
    if (!result.ok) return sendFailure(res, result);
    res.json({ status: "ok", data: result.appointment });
  });

  // PATCH /api/appointments/:id/status   (confirm, start, complete, cancel)
  const changeAppointmentStatus = withActor(async (req, res, actor) => {
    const result = await service.changeAppointmentStatus(
      req.params.id,
      req.body,
      actor,
    );
    if (!result.ok) return sendFailure(res, result);
    res.json({ status: "ok", data: result.appointment });
  });

  return {
    listAppointments,
    getAppointment,
    createAppointment,
    updateAppointment,
    changeAppointmentStatus,
  };
}
