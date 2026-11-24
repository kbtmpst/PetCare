import Modal from "../ui/Modal.jsx";
import Button from "../ui/Button.jsx";
import ServiceStatusBadge from "./ServiceStatusBadge.jsx";
import {
  formatCurrency,
  formatDuration,
  pluralize,
} from "../../../business/utils/format.js";

// One "label + value" pair in the details list.
function Detail({ label, className = "", children }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm">{children}</dd>
    </div>
  );
}

// Shows everything about one service. "service.appointmentCount" was added by the business layer.
export default function ServiceDetailsModal({
  service,
  onClose,
  onEdit,
  onDelete,
}) {
  return (
    <Modal
      title={service.name}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={() => onEdit(service)}>
            Edit
          </Button>
          <Button variant="danger-outline" onClick={() => onDelete(service)}>
            Delete
          </Button>
        </>
      }
    >
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Detail label="Service ID">{service.id}</Detail>
        <Detail label="Status">
          <ServiceStatusBadge status={service.status} />
        </Detail>
        <Detail label="Price">{formatCurrency(service.price)}</Detail>
        <Detail label="Duration">
          {formatDuration(service.durationMinutes)} ({service.durationMinutes}{" "}
          minutes)
        </Detail>
        <Detail label="Description" className="sm:col-span-2">
          {service.description || (
            <span className="text-muted">No description</span>
          )}
        </Detail>
        <Detail label="Appointments" className="sm:col-span-2">
          {service.appointmentCount === 0
            ? "Not booked yet"
            : `Booked in ${pluralize(service.appointmentCount, "appointment")}`}
        </Detail>
      </dl>

      {!service.active && (
        <p className="mt-5 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-muted">
          This service is inactive, so it does not appear when booking a new
          appointment.
        </p>
      )}
    </Modal>
  );
}
