import { Eye, Pencil, X } from "lucide-react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import IconButton from "../ui/IconButton.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import {
  canCancel,
  canEdit,
  getNextStatusAction,
} from "../../../business/services/appointmentService.js";
import {
  formatCurrency,
  formatShortDate,
  formatTime,
} from "../../../business/utils/format.js";

// Shared classes so every header cell and every body cell look the same.
const thClass = "whitespace-nowrap px-4 py-3 font-semibold";
const tdClass = "whitespace-nowrap px-4 py-3";

// The appointments table. On small screens the table keeps a minimum width and the card scrolls sideways,
// so columns never get squeezed too narrow to read.
export default function AppointmentTable({
  appointments,
  emptyMessage,
  onView,
  onEdit,
  onStatusChange,
  onCancel,
}) {
  return (
    <Card bodyClassName="p-0">
      {appointments.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="border-b border-line bg-sage-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className={thClass}>Appointment ID</th>
                <th className={thClass}>Pet Name</th>
                <th className={thClass}>Owner</th>
                <th className={thClass}>Service</th>
                <th className={thClass}>Date</th>
                <th className={thClass}>Time</th>
                <th className={thClass}>Price</th>
                <th className={thClass}>Status</th>
                <th className={`${thClass} text-right`}>Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {appointments.map((appointment) => {
                const nextAction = getNextStatusAction(appointment.status);

                return (
                  <tr key={appointment.id} className="hover:bg-sage-50/60">
                    <td className={`${tdClass} font-medium`}>
                      {appointment.id}
                    </td>
                    <td className={tdClass}>
                      <span className="font-medium">{appointment.pet}</span>
                      <span className="block text-xs text-muted">
                        {appointment.breed}
                      </span>
                    </td>
                    <td className={tdClass}>{appointment.customer}</td>
                    <td className={tdClass}>{appointment.service}</td>
                    <td className={tdClass}>
                      {formatShortDate(appointment.date)}
                    </td>
                    <td className={tdClass}>{formatTime(appointment.time)}</td>
                    <td className={tdClass}>
                      {formatCurrency(appointment.price)}
                    </td>
                    <td className={tdClass}>
                      <StatusBadge status={appointment.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {nextAction && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              onStatusChange(appointment, nextAction.status)
                            }
                          >
                            {nextAction.label}
                          </Button>
                        )}
                        <IconButton
                          label={`View ${appointment.id}`}
                          onClick={() => onView(appointment)}
                        >
                          <Eye size={18} />
                        </IconButton>
                        {canEdit(appointment.status) && (
                          <IconButton
                            label={`Edit ${appointment.id}`}
                            onClick={() => onEdit(appointment)}
                          >
                            <Pencil size={18} />
                          </IconButton>
                        )}
                        {canCancel(appointment.status) && (
                          <IconButton
                            label={`Cancel ${appointment.id}`}
                            danger
                            onClick={() => onCancel(appointment)}
                          >
                            <X size={18} />
                          </IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
