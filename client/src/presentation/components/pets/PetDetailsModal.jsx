import { useEffect, useState } from "react";
import Modal from "../ui/Modal.jsx";
import Button from "../ui/Button.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import { getPetHistory } from "../../../business/services/petService.js";
import {
  formatAge,
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
      <dd className="mt-1 break-words text-sm">{children}</dd>
    </div>
  );
}

// Shows everything about one pet, its owner, and its grooming history (the pet's past and upcoming appointments).
export default function PetDetailsModal({ pet, onClose, onEdit, onDelete }) {
  // STATE: the grooming history. null means "still loading".
  const [history, setHistory] = useState(null);

  // Load the history when the window opens (and again if it is opened for a different pet).
  useEffect(() => {
    getPetHistory(pet.id).then(setHistory);
  }, [pet.id]);

  return (
    <Modal
      title={pet.name}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={() => onEdit(pet)}>
            Edit
          </Button>
          <Button variant="danger-outline" onClick={() => onDelete(pet)}>
            Delete
          </Button>
        </>
      }
    >
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Detail label="Pet ID">{pet.id}</Detail>
        <Detail label="Species">{pet.species}</Detail>
        <Detail label="Breed">{pet.breed}</Detail>
        <Detail label="Sex">{pet.sex}</Detail>
        <Detail label="Age">
          {formatAge(pet.birthDate)}
          {pet.birthDate && (
            <span className="text-muted">
              {" "}
              · born {formatShortDate(pet.birthDate)}
            </span>
          )}
        </Detail>
        <Detail label="Owner">
          {pet.ownerName} <span className="text-muted">· {pet.customerId}</span>
          {pet.ownerContact && (
            <span className="block text-muted">{pet.ownerContact}</span>
          )}
        </Detail>
        <Detail label="Notes" className="sm:col-span-2">
          {pet.notes ? (
            <span className="whitespace-pre-wrap">{pet.notes}</span>
          ) : (
            <span className="text-muted">No notes</span>
          )}
        </Detail>
      </dl>

      <h3 className="mb-2 mt-6 text-sm font-semibold">Grooming History</h3>
      {history === null ? (
        <p className="text-sm text-muted">Loading history...</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-muted">
          No appointments yet for {pet.name}.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {history.map((appointment) => (
            <li
              key={appointment.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {appointment.service}{" "}
                  <span className="font-normal text-muted">
                    · {formatCurrency(appointment.price)}
                  </span>
                </p>
                <p className="text-xs text-muted">
                  {appointment.id} · {formatShortDate(appointment.date)} at{" "}
                  {formatTime(appointment.time)}
                </p>
              </div>
              <StatusBadge status={appointment.status} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
