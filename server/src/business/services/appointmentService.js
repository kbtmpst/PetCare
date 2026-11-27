// BUSINESS LAYER (wiring): connects the appointment logic to the REAL database repositories.
// The logic itself is in createAppointmentService.js. The controller (phase E2) will import these functions.
import * as appointmentRepository from "../../data/repositories/appointmentRepository.js";
import * as petRepository from "../../data/repositories/petRepository.js";
import * as serviceRepository from "../../data/repositories/serviceRepository.js";
import { config } from "../../config/env.js";
import { createAppointmentService } from "./createAppointmentService.js";

// Today's date ("YYYY-MM-DD") in the database time zone from server/.env (DB_TIMEZONE, for example +08:00),
// so "no dates in the past" uses the same "today" as the database.
function todayInServerTimeZone() {
  const [, sign, hours, minutes] = /^([+-])(\d{2}):(\d{2})$/.exec(
    config.db.timezone,
  );
  const offsetMinutes =
    (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
  return new Date(Date.now() + offsetMinutes * 60000)
    .toISOString()
    .slice(0, 10);
}

const appointmentService = createAppointmentService({
  appointments: appointmentRepository,
  pets: petRepository,
  services: serviceRepository,
  today: todayInServerTimeZone,
});

export const getAppointmentList = appointmentService.getAppointmentList;
export const getAppointment = appointmentService.getAppointment;
export const createAppointment = appointmentService.createAppointment;
export const updateAppointment = appointmentService.updateAppointment;
export const changeAppointmentStatus =
  appointmentService.changeAppointmentStatus;
