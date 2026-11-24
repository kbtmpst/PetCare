import Modal from "../ui/Modal.jsx";
import Button from "../ui/Button.jsx";
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

// One "label + value" pair in the details list.
function Detail({ label, className = "", children }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

// Shows everything about one appointment, with buttons for the actions that are allowed for its status.
export default function AppointmentDetailsModal({
  appointment,
  onClose,
  onEdit,
  onStatusChange,
  onCancel,
}) {
  const nextAction = getNextStatusAction(appointment.status);

  return (
    <Modal
      title={`Appointment ${appointment.id}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {canEdit(appointment.status) && (
            <Button variant="secondary" onClick={() => onEdit(appointment)}>
              Edit
            </Button>
          )}
          {canCancel(appointment.status) && (
            <Button
              variant="danger-outline"
              onClick={() => onCancel(appointment)}
            >
              Cancel Appointment
            </Button>
          )}
          {nextAction && (
            <Button
              onClick={() => onStatusChange(appointment, nextAction.status)}
            >
              {nextAction.label}
            </Button>
          )}
        </>
      }
    >
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Detail label="Status">
          <StatusBadge status={appointment.status} />
        </Detail>
        <Detail label="Price">{formatCurrency(appointment.price)}</Detail>
        <Detail label="Pet">
          {appointment.pet}{" "}
          <span className="text-muted">· {appointment.breed}</span>
        </Detail>
        <Detail label="Owner">{appointment.customer}</Detail>
        <Detail label="Service">{appointment.service}</Detail>
        <Detail label="Date and Time">
          {formatShortDate(appointment.date)} at {formatTime(appointment.time)}
        </Detail>
        <Detail label="Notes" className="sm:col-span-2">
          {appointment.notes ? (
            <span className="whitespace-pre-wrap break-words">
              {appointment.notes}
            </span>
          ) : (
            <span className="text-muted">No notes</span>
          )}
        </Detail>
      </dl>
    </Modal>
  );
}
