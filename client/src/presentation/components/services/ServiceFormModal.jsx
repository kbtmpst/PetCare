import { useState } from "react";
import Modal from "../ui/Modal.jsx";
import Button from "../ui/Button.jsx";
import FormField, { inputClass, textareaClass } from "../ui/FormField.jsx";

// The Add / Edit service form, shown inside a Modal.
//   service:  null when adding a new service, or the service being edited
//   statuses: the choices for the Status dropdown (["Active", "Inactive"])
//   onSave:   async function(form) -> { ok, errors }. The page does the saving.
//   onClose:  closes the modal without saving

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  durationMinutes: "",
  status: "Active",
};

// Converts a service record into form values. Form inputs always work with strings.
function toFormValues(service) {
  if (!service) return EMPTY_FORM;
  return {
    name: service.name,
    description: service.description || "",
    price: String(service.price),
    durationMinutes: String(service.durationMinutes),
    status: service.active ? "Active" : "Inactive",
  };
}

export default function ServiceFormModal({
  service,
  statuses,
  onSave,
  onClose,
}) {
  // STATE: what is typed in the form, the error messages, and whether we are saving right now.
  const [form, setForm] = useState(() => toFormValues(service));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const isEditing = service !== null;

  // Update one field, and clear that field's error message.
  function handleChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
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
      title={isEditing ? `Edit ${service.name}` : "New Service"}
      size="md"
      onClose={onClose}
      closeOnBackgroundClick={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Discard
          </Button>
          <Button type="submit" form="service-form" disabled={saving}>
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Add Service"}
          </Button>
        </>
      }
    >
      <form id="service-form" onSubmit={handleSubmit} noValidate>
        {errors.general && (
          <p
            className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {errors.general}
          </p>
        )}

        {/* One column on phones, two columns from the tablet breakpoint up. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Service Name"
            htmlFor="name"
            required
            error={errors.name}
            className="sm:col-span-2"
          >
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(event) => handleChange("name", event.target.value)}
              className={inputClass(Boolean(errors.name))}
            />
          </FormField>

          <FormField
            label="Description"
            htmlFor="description"
            error={errors.description}
            hint="Optional"
            className="sm:col-span-2"
          >
            <textarea
              id="description"
              rows={2}
              maxLength={200}
              value={form.description}
              onChange={(event) =>
                handleChange("description", event.target.value)
              }
              className={textareaClass(Boolean(errors.description))}
            />
          </FormField>

          <FormField
            label="Price (₱)"
            htmlFor="price"
            required
            error={errors.price}
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

          <FormField
            label="Duration (minutes)"
            htmlFor="durationMinutes"
            required
            error={errors.durationMinutes}
          >
            <input
              id="durationMinutes"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={form.durationMinutes}
              onChange={(event) =>
                handleChange("durationMinutes", event.target.value)
              }
              className={inputClass(Boolean(errors.durationMinutes))}
            />
          </FormField>

          <FormField
            label="Status"
            htmlFor="status"
            required
            error={errors.status}
            hint="Inactive services cannot be booked in new appointments."
            className="sm:col-span-2"
          >
            <select
              id="status"
              value={form.status}
              onChange={(event) => handleChange("status", event.target.value)}
              className={inputClass(Boolean(errors.status))}
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
