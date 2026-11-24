import { useState } from "react";
import Modal from "../ui/Modal.jsx";
import Button from "../ui/Button.jsx";
import FormField, { inputClass, textareaClass } from "../ui/FormField.jsx";

// The Add / Edit customer form, shown inside a Modal.
//   customer: null when adding a new customer, or the customer being edited
//   onSave:   async function(form) -> { ok, errors }. The page does the saving.
//   onClose:  closes the modal without saving

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  contactNumber: "",
  email: "",
  address: "",
};

// Converts a customer record into form values. Form inputs always work with strings.
function toFormValues(customer) {
  if (!customer) return EMPTY_FORM;
  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    contactNumber: customer.contactNumber,
    email: customer.email || "",
    address: customer.address || "",
  };
}

export default function CustomerFormModal({ customer, onSave, onClose }) {
  // STATE: what is typed in the form, the error messages, and whether we are saving right now.
  const [form, setForm] = useState(() => toFormValues(customer));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const isEditing = customer !== null;

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
      title={isEditing ? `Edit Customer ${customer.id}` : "New Customer"}
      size="md"
      onClose={onClose}
      closeOnBackgroundClick={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Discard
          </Button>
          <Button type="submit" form="customer-form" disabled={saving}>
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Add Customer"}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={handleSubmit} noValidate>
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
            label="First Name"
            htmlFor="firstName"
            required
            error={errors.firstName}
          >
            <input
              id="firstName"
              type="text"
              value={form.firstName}
              onChange={(event) =>
                handleChange("firstName", event.target.value)
              }
              className={inputClass(Boolean(errors.firstName))}
            />
          </FormField>

          <FormField
            label="Last Name"
            htmlFor="lastName"
            required
            error={errors.lastName}
          >
            <input
              id="lastName"
              type="text"
              value={form.lastName}
              onChange={(event) => handleChange("lastName", event.target.value)}
              className={inputClass(Boolean(errors.lastName))}
            />
          </FormField>

          <FormField
            label="Contact Number"
            htmlFor="contactNumber"
            required
            error={errors.contactNumber}
          >
            <input
              id="contactNumber"
              type="tel"
              inputMode="tel"
              placeholder="0917 123 4567"
              value={form.contactNumber}
              onChange={(event) =>
                handleChange("contactNumber", event.target.value)
              }
              className={inputClass(Boolean(errors.contactNumber))}
            />
          </FormField>

          <FormField
            label="Email"
            htmlFor="email"
            error={errors.email}
            hint="Optional"
          >
            <input
              id="email"
              type="email"
              inputMode="email"
              placeholder="name@example.com"
              value={form.email}
              onChange={(event) => handleChange("email", event.target.value)}
              className={inputClass(Boolean(errors.email))}
            />
          </FormField>

          <FormField
            label="Address"
            htmlFor="address"
            error={errors.address}
            hint="Optional"
            className="sm:col-span-2"
          >
            <textarea
              id="address"
              rows={2}
              maxLength={200}
              value={form.address}
              onChange={(event) => handleChange("address", event.target.value)}
              className={textareaClass(Boolean(errors.address))}
            />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
