// CONTROLLER (wiring): plugs the REAL appointment business functions into the controller logic in
// createAppointmentController.js. The routes (phase E2, next batch) import this file.
import * as appointmentService from "../business/services/appointmentService.js";
import { createAppointmentController } from "./createAppointmentController.js";

export const {
  listAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  changeAppointmentStatus,
} = createAppointmentController({ service: appointmentService });
