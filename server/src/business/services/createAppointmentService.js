// BUSINESS LAYER: the rules for appointments.
// This file only contains the LOGIC. The things it needs (the repositories and "today") are handed in as
// "deps", so the tests can give it fake versions and run without MySQL. appointmentService.js plugs in the real ones.
// Nothing here knows about Express, requests or responses.
//
// WHO IS ASKING: every function takes an "actor" = { role, customerId }. The route layer (phase E2) builds it from
// the logged-in user (req.user.role and req.user.customerId, both loaded from the database). It is never read from
// the request body. Admin and staff may work with every appointment. A customer may only work with their own, and
// gets the SAME "forbidden" answer for an appointment that is someone else's, does not exist, or has a bad id,
// so nobody can use this API to find out which appointments exist.
//
// Every function returns a result object, never throws for a "normal" problem:
//   { ok: true, ... }                                          it worked
//   { ok: false, type: "validation", message, errors }         the input is wrong              (HTTP 400)
//   { ok: false, type: "forbidden", message }                  not allowed for this actor       (HTTP 403)
//   { ok: false, type: "notFound", message, errors? }          the appointment, pet or service is missing (HTTP 404)
//   { ok: false, type: "conflict", message, errors? }          the time is taken, or the status/state does not allow
//                                                              it                              (HTTP 409)
//
// Rules (approved for phase E):
//   - the OWNER is the pet's owner at booking time (a snapshot: it stays even if the pet gets a new owner later)
//   - the PRICE and DURATION come from the service record, never from the request; new appointments are "Pending"
//   - an inactive service cannot be booked; no dates in the past
//   - the shop has ONE groomer: no two appointments may overlap (cancelled ones are ignored)
//   - customers: book/edit/reschedule/cancel their own appointments only; edit only while Pending; cancel only
//     while Pending or Confirmed; they can never Confirm, Start or Complete
//   - staff/admin: book for any pet (walk-ins too); edit open appointments; Pending > Confirmed > In Progress >
//     Completed; cancel from any open state
//   - Completed and Cancelled are final. Completing saves the payment record in the SAME transaction
//   - a booking or a reschedule runs inside the schedule lock, so two requests cannot double-book
import {
  parseId,
  validateAppointmentInput,
  validateAppointmentFilters,
  validateStatusInput,
} from "../validators/appointmentValidator.js";

const ROLES = ["admin", "staff", "customer"];

// The normal path of an appointment.
const NEXT_STATUS = {
  Pending: "Confirmed",
  Confirmed: "In Progress",
  "In Progress": "Completed",
};
const STAFF_CAN_CANCEL = ["Pending", "Confirmed", "In Progress"];
const CUSTOMER_CAN_CANCEL = ["Pending", "Confirmed"];
const FINISHED = ["Completed", "Cancelled"];

// ---------------------------------------------------------------------------
// Small result helpers
// ---------------------------------------------------------------------------

function validationFailure(errors) {
  return {
    ok: false,
    type: "validation",
    message: "Validation failed. Please check the fields.",
    errors,
  };
}

function forbidden() {
  return {
    ok: false,
    type: "forbidden",
    message: "You do not have permission to do this.",
  };
}

function appointmentNotFound(id) {
  return {
    ok: false,
    type: "notFound",
    message: `Appointment ${id} was not found.`,
  };
}

function petNotFound(petId) {
  return {
    ok: false,
    type: "notFound",
    message: `Pet ${petId} was not found.`,
    errors: { petId: "That pet could not be found." },
  };
}

function serviceNotFound(serviceId) {
  return {
    ok: false,
    type: "notFound",
    message: `Service ${serviceId} was not found.`,
    errors: { serviceId: "That service could not be found." },
  };
}

function conflict(message, errors) {
  return { ok: false, type: "conflict", message, errors };
}

// ---------------------------------------------------------------------------
// Time helpers (the same arithmetic as the frontend's schedule check)
// ---------------------------------------------------------------------------

// "2026-11-25" + "13:30" -> a number of minutes. Using the date too means appointments on different days never
// overlap, and a long appointment that runs past midnight is still compared correctly.
function toMinutes(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day) / 60000 + hours * 60 + minutes;
}

// "13:00" + 90 minutes -> "14:30"
function formatEndTime(time, durationMinutes) {
  const [hours, minutes] = time.split(":").map(Number);
  const total = (hours * 60 + minutes + durationMinutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// deps = {
//   appointments: the appointment repository (getAppointments, getAppointmentById, runInTransaction,
//                 runInScheduleTransaction),
//   pets:         { getPetById },
//   services:     { getServiceById },
//   today:        () => "YYYY-MM-DD" in the database time zone,
// }
export function createAppointmentService({
  appointments,
  pets,
  services,
  today,
}) {
  // -------------------------------------------------------------------------
  // The actor
  // -------------------------------------------------------------------------

  // Turns { role, customerId } into something safe to use. A missing actor or an unknown role is a programming
  // mistake in the caller, so it throws (and the request ends as a 500) instead of guessing and letting someone in.
  function readActor(actor) {
    if (
      actor === null ||
      typeof actor !== "object" ||
      !ROLES.includes(actor.role)
    ) {
      throw new Error(
        `The appointment service needs an actor with a role of: ${ROLES.join(", ")}.`,
      );
    }
    const isCustomer = actor.role === "customer";
    // A customer account without a customer profile (customerId missing) owns nothing and can do nothing here.
    const customerId =
      isCustomer && Number.isInteger(actor.customerId) && actor.customerId > 0
        ? actor.customerId
        : null;
    return { role: actor.role, isCustomer, customerId };
  }

  // May this actor see/change this appointment? Staff and admin: yes. A customer: only their own.
  function ownsOrIsStaff(who, appointment) {
    return (
      !who.isCustomer ||
      (who.customerId !== null && appointment.customerId === who.customerId)
    );
  }

  // The answer when an appointment is missing: customers get the same "forbidden" as for someone else's.
  function missingFor(who, id) {
    return who.isCustomer ? forbidden() : appointmentNotFound(id);
  }

  // Reads the :id and loads the appointment, checking that this actor may see it.
  // Returns { appointment } or { failure }.
  async function loadForActor(idText, who) {
    const id = parseId(idText);
    if (id === null) {
      if (who.isCustomer) return { failure: forbidden() };
      return {
        failure: validationFailure({
          id: "The appointment id must be a positive whole number.",
        }),
      };
    }
    if (who.isCustomer && who.customerId === null)
      return { failure: forbidden() };

    const appointment = await appointments.getAppointmentById(id);
    if (!appointment) return { failure: missingFor(who, id) };
    if (!ownsOrIsStaff(who, appointment)) return { failure: forbidden() };
    return { appointment };
  }

  // -------------------------------------------------------------------------
  // Rules about the state of an appointment
  // -------------------------------------------------------------------------

  // Can this actor edit/reschedule this appointment? Returns null (yes) or a failure result.
  function checkEditable(who, appointment) {
    if (FINISHED.includes(appointment.status)) {
      return conflict(`${appointment.status} appointments cannot be edited.`);
    }
    if (who.isCustomer && appointment.status !== "Pending") {
      return conflict(
        `Only Pending appointments can be edited. This one is ${appointment.status}.`,
      );
    }
    return null;
  }

  // Can this actor move this appointment to newStatus? Returns null (yes) or a failure result.
  function checkTransition(who, appointment, newStatus) {
    if (who.isCustomer) {
      if (newStatus !== "Cancelled") return forbidden(); // customers never Confirm, Start or Complete
      if (!CUSTOMER_CAN_CANCEL.includes(appointment.status)) {
        return conflict(
          `A ${appointment.status} appointment cannot be cancelled.`,
        );
      }
      return null;
    }
    const isNextStep = NEXT_STATUS[appointment.status] === newStatus;
    const isCancelling =
      newStatus === "Cancelled" &&
      STAFF_CAN_CANCEL.includes(appointment.status);
    if (!isNextStep && !isCancelling) {
      return conflict(
        `A ${appointment.status} appointment cannot be changed to ${newStatus}.`,
      );
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Looking up the pet and the service
  // -------------------------------------------------------------------------

  // Finds the pet and the service named in the form. A customer may only use their own pets: any other pet
  // (someone else's, or one that does not exist) is "forbidden". Staff and admin may use any pet.
  // Returns { pet, service } or { failure }.
  async function resolvePetAndService(values, who) {
    const pet = await pets.getPetById(values.petId);
    if (who.isCustomer) {
      if (!pet || who.customerId === null || pet.customerId !== who.customerId)
        return { failure: forbidden() };
    } else if (!pet) {
      return { failure: petNotFound(values.petId) };
    }

    const service = await services.getServiceById(values.serviceId);
    if (!service) return { failure: serviceNotFound(values.serviceId) };
    return { pet, service };
  }

  function inactiveService() {
    return validationFailure({
      serviceId: "This service is not available for booking.",
    });
  }

  // -------------------------------------------------------------------------
  // The schedule check (runs INSIDE the schedule lock)
  // -------------------------------------------------------------------------

  // Looks for an appointment that overlaps date + time + duration. Two appointments overlap when each one starts
  // before the other ends (one that starts exactly when another ends is fine). Cancelled ones are ignored by the
  // repository query. Returns a failure result, or null when the time is free.
  //
  // PRIVACY: a customer is only told "that time is not available". Staff and admin also get the other
  // appointment's number and time window, but never a pet or owner name.
  async function findScheduleConflict(
    tx,
    who,
    { date, time, durationMinutes, excludeId },
  ) {
    const candidates = await tx.findScheduleCandidates({ date, excludeId });

    const newStart = toMinutes(date, time);
    const newEnd = newStart + durationMinutes;

    const overlapping = candidates
      .filter((other) => other.id !== excludeId)
      .map((other) => ({ ...other, start: toMinutes(other.date, other.time) }))
      .filter(
        (other) =>
          newStart < other.start + other.durationMinutes &&
          other.start < newEnd,
      )
      .sort((a, b) => a.start - b.start || a.id - b.id);

    if (overlapping.length === 0) return null;

    if (who.isCustomer) {
      const message =
        "That time is not available. Please choose a different time.";
      return conflict(message, { time: message });
    }
    const first = overlapping[0];
    const message =
      `This time overlaps appointment ${first.id} (${first.time} to ${formatEndTime(first.time, first.durationMinutes)} ` +
      `on ${first.date}). The shop can groom one pet at a time, so choose a different time.`;
    return conflict(message, { time: message });
  }

  // Turns a few known database errors into normal results. Anything else is re-thrown (the controller's
  // error handler answers 500).
  function mapSaveError(error) {
    if (error && error.code === "SCHEDULE_LOCK_TIMEOUT") {
      return conflict(
        "The schedule is busy right now. Please try again in a moment.",
      );
    }
    // The database trigger that keeps "appointment owner = pet owner" (SQLSTATE 45000): the pet changed owner
    // between our check and the save.
    if (
      error &&
      (error.sqlState === "45000" || error.code === "ER_SIGNAL_EXCEPTION")
    ) {
      return validationFailure({
        petId: "The pet's owner changed while saving. Please try again.",
      });
    }
    if (error && error.code === "ER_NO_REFERENCED_ROW_2") {
      return {
        ok: false,
        type: "notFound",
        message: "The pet or the service was not found.",
      };
    }
    throw error;
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  // All appointments. "query" is the URL query (for example { status: "Pending", date: "2026-12-01" }).
  // A customer only ever gets their own: any customerId filter they send is replaced by their own id.
  async function getAppointmentList(query, actor) {
    const who = readActor(actor);
    const { errors, filters } = validateAppointmentFilters(query);
    if (Object.keys(errors).length > 0) return validationFailure(errors);

    if (who.isCustomer) {
      if (who.customerId === null) return forbidden();
      filters.customerId = who.customerId;
    }

    const list = await appointments.getAppointments(filters);
    return { ok: true, appointments: list };
  }

  async function getAppointment(idText, actor) {
    const who = readActor(actor);
    const { appointment, failure } = await loadForActor(idText, who);
    if (failure) return failure;
    return { ok: true, appointment };
  }

  // -------------------------------------------------------------------------
  // Booking
  // -------------------------------------------------------------------------

  async function createAppointment(body, actor) {
    const who = readActor(actor);
    if (who.isCustomer && who.customerId === null) return forbidden();

    // Only petId, serviceId, date, time and notes are read. customerId, price, duration and status in the body
    // are ignored on purpose.
    const { errors, values } = validateAppointmentInput(body, today());
    if (Object.keys(errors).length > 0) return validationFailure(errors);

    const { pet, service, failure } = await resolvePetAndService(values, who);
    if (failure) return failure;
    if (!service.active) return inactiveService();

    try {
      return await appointments.runInScheduleTransaction(async (tx) => {
        const clash = await findScheduleConflict(tx, who, {
          date: values.date,
          time: values.time,
          durationMinutes: service.durationMinutes,
        });
        if (clash) return clash;

        const appointment = await tx.insertAppointment({
          petId: pet.id,
          customerId: pet.customerId, // the pet's owner, NOT anything from the request
          serviceId: service.id,
          price: service.price, // from the service record
          durationMinutes: service.durationMinutes, // from the service record
          date: values.date,
          time: values.time,
          notes: values.notes,
          status: "Pending",
        });
        return { ok: true, appointment };
      });
    } catch (error) {
      return mapSaveError(error);
    }
  }

  // -------------------------------------------------------------------------
  // Editing / rescheduling
  // -------------------------------------------------------------------------

  // Replaces the pet, service, date, time and notes of an appointment. The status is not changed here.
  async function updateAppointment(idText, body, actor) {
    const who = readActor(actor);
    const loaded = await loadForActor(idText, who);
    if (loaded.failure) return loaded.failure;
    const existing = loaded.appointment;

    const notEditable = checkEditable(who, existing);
    if (notEditable) return notEditable;

    const { errors, values } = validateAppointmentInput(
      body,
      today(),
      existing,
    );
    if (Object.keys(errors).length > 0) return validationFailure(errors);

    const { pet, service, failure } = await resolvePetAndService(values, who);
    if (failure) return failure;

    // Choosing a DIFFERENT service must be an active one (and it brings that service's price and duration).
    // Keeping the same service keeps the price and duration the appointment was booked with.
    const serviceChanged = service.id !== existing.serviceId;
    if (serviceChanged && !service.active) return inactiveService();
    const price = serviceChanged ? service.price : existing.price;
    const durationMinutes = serviceChanged
      ? service.durationMinutes
      : existing.durationMinutes;

    // The owner is derived from the pet. If the pet did not change, the appointment keeps the owner it was
    // booked with (so nobody can change ownership through an edit).
    const customerId =
      pet.id === existing.petId ? existing.customerId : pet.customerId;

    try {
      return await appointments.runInScheduleTransaction(async (tx) => {
        // Lock the row and look again: it may have been cancelled or confirmed since we first read it.
        const locked = await tx.getAppointmentForUpdate(existing.id);
        if (!locked) return missingFor(who, existing.id);
        if (!ownsOrIsStaff(who, locked)) return forbidden();
        const stillEditable = checkEditable(who, locked);
        if (stillEditable) return stillEditable;

        const scheduleChanged =
          values.date !== locked.date ||
          values.time !== locked.time ||
          durationMinutes !== locked.durationMinutes;
        if (scheduleChanged) {
          const clash = await findScheduleConflict(tx, who, {
            date: values.date,
            time: values.time,
            durationMinutes,
            excludeId: locked.id, // it never conflicts with itself
          });
          if (clash) return clash;
        }

        const appointment = await tx.updateAppointmentDetails(locked.id, {
          petId: pet.id,
          customerId,
          serviceId: service.id,
          price,
          durationMinutes,
          date: values.date,
          time: values.time,
          notes: values.notes,
        });
        return { ok: true, appointment };
      });
    } catch (error) {
      return mapSaveError(error);
    }
  }

  // -------------------------------------------------------------------------
  // Status changes
  // -------------------------------------------------------------------------

  // body = { status: "Confirmed" }. Cancelling is the same call with status "Cancelled".
  async function changeAppointmentStatus(idText, body, actor) {
    const who = readActor(actor);
    const loaded = await loadForActor(idText, who);
    if (loaded.failure) return loaded.failure;
    const existing = loaded.appointment;

    const { errors, status: newStatus } = validateStatusInput(body);
    if (Object.keys(errors).length > 0) return validationFailure(errors);

    const notAllowed = checkTransition(who, existing, newStatus);
    if (notAllowed) return notAllowed;

    try {
      return await appointments.runInTransaction(async (tx) => {
        // Lock the row and check the move again on the freshest data (two people may click at the same time).
        const locked = await tx.getAppointmentForUpdate(existing.id);
        if (!locked) return missingFor(who, existing.id);
        if (!ownsOrIsStaff(who, locked)) return forbidden();
        const stillAllowed = checkTransition(who, locked, newStatus);
        if (stillAllowed) return stillAllowed;

        await tx.setStatus(locked.id, newStatus);

        // Completing creates the payment record. It is saved in the SAME transaction: if this INSERT fails,
        // the status change is undone too, so an appointment is never "Completed" without its payment record.
        if (newStatus === "Completed") {
          await tx.insertTransaction({
            appointmentId: locked.id,
            serviceName: locked.service,
            amount: locked.price,
          });
        }

        const appointment = await tx.getAppointmentById(locked.id);
        return { ok: true, appointment };
      });
    } catch (error) {
      // A payment record already exists for this appointment (the appointment_id column is UNIQUE).
      if (error && error.code === "ER_DUP_ENTRY") {
        return conflict("This appointment already has a payment record.");
      }
      return mapSaveError(error);
    }
  }

  return {
    getAppointmentList,
    getAppointment,
    createAppointment,
    updateAppointment,
    changeAppointmentStatus,
  };
}
