import { useState } from "react";
import { Link } from "react-router-dom";
import Modal from "../ui/Modal.jsx";
import Button from "../ui/Button.jsx";
import FormField, { inputClass, textareaClass } from "../ui/FormField.jsx";
import { toISODate } from "../../../business/utils/format.js";

// The Add / Edit appointment form, shown inside a Modal.
//   appointment: null when creating a new one, or the appointment being edited
//   options:     { pets, services } for the dropdowns
//   onSave:      async function(form) -> { ok, errors }. The page does the saving.
//   onClose:     closes the modal without saving

const EMPTY_FORM = {
  petId: "",
  serviceId: "",
  date: "",
  time: "",
  price: "",
  notes: "",
};

// Converts an appointment into form values. Form inputs always work with strings.
function toFormValues(appointment) {
  if (!appointment) return EMPTY_FORM;
  return {
    petId: String(appointment.petId),
    serviceId: String(appointment.serviceId),
    date: appointment.date,
    time: appointment.time,
    price: String(appointment.price),
    notes: appointment.notes || "",
  };
}

export default function AppointmentFormModal({
  appointment,
  options,
  onSave,
  onClose,
}) {
  // STATE: what is typed in the form, the error messages, and whether we are saving right now.
  const [form, setForm] = useState(() => toFormValues(appointment));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const isEditing = appointment !== null;

  // The owner is not typed in. It is looked up through the selected pet (pet.customerId -> customer),
  // and the business layer already added it to each pet as "ownerName". This keeps pet and owner matched.
  const selectedPet = options.pets.find((pet) => String(pet.id) === form.petId);

  // Only active services can be picked, plus the one this appointment already uses (when editing).
  const serviceChoices = options.services.filter(
    (service) => service.active || String(service.id) === form.serviceId,
  );

  // Update one field, and clear that field's error message.
  function handleChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  // When a service is picked, fill in its price automatically (staff can still change the price).
  function handleServiceChange(serviceId) {
    const service = options.services.find(
      (item) => String(item.id) === serviceId,
    );
    setForm((current) => ({
      ...current,
      serviceId,
      price: service ? String(service.price) : "",
    }));
    setErrors((current) => ({
      ...current,
      serviceId: undefined,
      price: undefined,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault(); // stop the browser from reloading the page
    setSaving(true);
    const result = await onSave(form); // the page saves it; the business layer validates it
    setSaving(false);
    if (!result.ok) setErrors(result.errors);
  }

  return (
    <Modal
      title={
        isEditing ? `Edit Appointment ${appointment.id}` : "New Appointment"
      }
      size="lg"
      onClose={onClose}
      closeOnBackgroundClick={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Discard
          </Button>
          <Button
            type="submit"
            form="appointment-form"
            disabled={saving || options.pets.length === 0}
          >
            {saving
              ? "Saving..."
              : isEditing
                ? "Save Changes"
                : "Create Appointment"}
          </Button>
        </>
      }
    >
      <form id="appointment-form" onSubmit={handleSubmit} noValidate>
        {errors.general && (
          <p
            className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {errors.general}
          </p>
        )}

        {/* An appointment needs a registered pet (and the pet needs an owner), so explain what to do first. */}
        {options.pets.length === 0 && (
          <p
            role="status"
            className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            No pets are registered yet, so an appointment cannot be created.
            First add the owner on the{" "}
            <Link to="/customers" className="font-medium underline">
              Customers
            </Link>{" "}
            page, then register the pet on the{" "}
            <Link to="/pets" className="font-medium underline">
              Pets
            </Link>{" "}
            page.
          </p>
        )}

        {/* One column on phones, two columns from the tablet breakpoint up. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Pet" htmlFor="petId" required error={errors.petId}>
            <select
              id="petId"
              value={form.petId}
              onChange={(event) => handleChange("petId", event.target.value)}
              className={inputClass(Boolean(errors.petId))}
            >
              <option value="">Select a pet</option>
              {options.pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.name} ({pet.breed}) – {pet.ownerName}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Pet Owner"
            htmlFor="owner"
            hint="Filled in automatically from the pet."
          >
            <input
              id="owner"
              type="text"
              value={selectedPet ? selectedPet.ownerName : ""}
              placeholder="Select a pet first"
              readOnly
              className={inputClass()}
            />
          </FormField>

          <FormField
            label="Grooming Service"
            htmlFor="serviceId"
            required
            error={errors.serviceId}
          >
            <select
              id="serviceId"
              value={form.serviceId}
              onChange={(event) => handleServiceChange(event.target.value)}
              className={inputClass(Boolean(errors.serviceId))}
            >
              <option value="">Select a service</option>
              {serviceChoices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Price (₱)"
            htmlFor="price"
            required
            error={errors.price}
            hint="Filled in from the service. You can adjust it."
          >
            <input
              id="price"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.price}
              onChange={(event) => handleChange("price", event.target.value)}
              className={inputClass(Boolean(errors.price))}
            />
          </FormField>

          <FormField label="Date" htmlFor="date" required error={errors.date}>
            <input
              id="date"
              type="date"
              value={form.date}
              min={isEditing ? undefined : toISODate()}
              onChange={(event) => handleChange("date", event.target.value)}
              className={inputClass(Boolean(errors.date))}
            />
          </FormField>

          <FormField label="Time" htmlFor="time" required error={errors.time}>
            <input
              id="time"
              type="time"
              value={form.time}
              onChange={(event) => handleChange("time", event.target.value)}
              className={inputClass(Boolean(errors.time))}
            />
          </FormField>

          <FormField
            label="Notes"
            htmlFor="notes"
            error={errors.notes}
            className="sm:col-span-2"
          >
            <textarea
              id="notes"
              rows={3}
              maxLength={300}
              value={form.notes}
              placeholder="Optional: coat condition, temperament, special requests..."
              onChange={(event) => handleChange("notes", event.target.value)}
              className={textareaClass(Boolean(errors.notes))}
            />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
