import { Link } from "react-router-dom";
import Modal from "../ui/Modal.jsx";
import Button from "../ui/Button.jsx";
import { formatAge, formatShortDate } from "../../../business/utils/format.js";

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

// Shows everything about one customer, including the pets that belong to them.
// "customer.pets" was added by the business layer: it is the list of pets whose customerId matches this customer.
export default function CustomerDetailsModal({
  customer,
  onClose,
  onEdit,
  onDelete,
}) {
  return (
    <Modal
      title={customer.fullName}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={() => onEdit(customer)}>
            Edit
          </Button>
          <Button variant="danger-outline" onClick={() => onDelete(customer)}>
            Delete
          </Button>
        </>
      }
    >
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Detail label="Customer ID">{customer.id}</Detail>
        <Detail label="Date Registered">
          {formatShortDate(customer.dateRegistered)}
        </Detail>
        <Detail label="Contact Number">{customer.contactNumber}</Detail>
        <Detail label="Email">
          {customer.email || <span className="text-muted">Not provided</span>}
        </Detail>
        <Detail label="Address" className="sm:col-span-2">
          {customer.address || <span className="text-muted">Not provided</span>}
        </Detail>
      </dl>

      <h3 className="mb-2 mt-6 text-sm font-semibold">
        Registered Pets ({customer.petCount})
      </h3>
      {customer.pets.length === 0 ? (
        <p className="text-sm text-muted">
          No pets registered yet. You can add one on the{" "}
          <Link to="/pets" className="font-medium text-sage-700 underline">
            Pets
          </Link>{" "}
          page.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {customer.pets.map((pet) => (
            <li
              key={pet.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {pet.name}{" "}
                  <span className="font-normal text-muted">· {pet.id}</span>
                </p>
                <p className="text-xs text-muted">
                  {pet.species} · {pet.breed}
                </p>
              </div>
              <p className="text-xs text-muted">
                {pet.sex} · {formatAge(pet.birthDate)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
