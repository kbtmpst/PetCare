import StatusBadge from "../ui/StatusBadge.jsx";
import { formatShortDate, formatTime } from "../../../business/utils/format.js";

// A list of appointments for the Dashboard. Every row shows:
//   pet name + pet type (species) + breed, owner name, service, date and time, and the status.
// The names were already looked up by the business layer through the IDs (appointment.petId and
// appointment.customerId), and it already uses "Unknown pet" / "Unknown owner" when a record is missing.
//   appointments: the rows to show
//   showDate:     true for Upcoming / Recent (rows from other days), false for Today's Schedule
//   emptyMessage: shown when there are no rows
export default function AppointmentList({
  appointments,
  showDate = false,
  emptyMessage,
}) {
  if (appointments.length === 0) {
    return <p className="p-4 text-sm text-muted sm:p-5">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {appointments.map((appointment) => (
        // Mobile: time and status on the first line, pet details below.
        // Tablet and up: everything on one row.
        <li
          key={appointment.id}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:flex-nowrap sm:px-5"
        >
          <div className="order-1 w-28 shrink-0 text-sm">
            {showDate && (
              <p className="font-medium">{formatShortDate(appointment.date)}</p>
            )}
            <p className={showDate ? "text-xs text-muted" : "font-medium"}>
              {formatTime(appointment.time)}
            </p>
          </div>

          <div className="order-3 min-w-0 basis-full sm:order-2 sm:flex-1 sm:basis-0">
            <p className="truncate text-sm font-medium">
              {appointment.pet}
              <span className="font-normal text-muted">
                {" "}
                · {appointment.species}
                {appointment.breed ? ` · ${appointment.breed}` : ""}
              </span>
            </p>
            <p className="truncate text-xs text-muted">
              Owner: {appointment.customer} · {appointment.service}
            </p>
          </div>

          <div className="order-2 ml-auto sm:order-3 sm:ml-0">
            <StatusBadge status={appointment.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}
