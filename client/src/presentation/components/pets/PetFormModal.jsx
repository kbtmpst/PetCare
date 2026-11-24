import { useState } from "react";
import { Link } from "react-router-dom";
import Modal from "../ui/Modal.jsx";
import Button from "../ui/Button.jsx";
import FormField, { inputClass, textareaClass } from "../ui/FormField.jsx";
import {
  PET_SEXES,
  PET_SPECIES,
} from "../../../business/validators/petValidator.js";
import { toISODate } from "../../../business/utils/format.js";

// The Add / Edit pet form, shown inside a Modal.
//   pet:     null when adding a new pet, or the pet being edited
//   owners:  the registered customers, for the Owner dropdown (each has id, fullName, contactNumber)
//   onSave:  async function(form) -> { ok, errors }. The page does the saving.
//   onClose: closes the modal without saving
//
// The owner is chosen from real customers. The form stores the customer's ID (form.customerId),
// never a typed name, so a pet can only ever be linked to a customer that exists.

const EMPTY_FORM = {
  customerId: "",
  name: "",
  species: "",
  breed: "",
  birthDate: "",
  sex: "",
  notes: "",
};

// Converts a pet record into form values. Form inputs always work with strings.
function toFormValues(pet) {
  if (!pet) return EMPTY_FORM;
  return {
    customerId: pet.customerId,
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    birthDate: pet.birthDate || "",
    sex: pet.sex,
    notes: pet.notes || "",
  };
}

export default function PetFormModal({ pet, owners, onSave, onClose }) {
  // STATE: what is typed in the form, the error messages, and whether we are saving right now.
  const [form, setForm] = useState(() => toFormValues(pet));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const isEditing = pet !== null;

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
      title={isEditing ? `Edit Pet ${pet.id}` : "New Pet"}
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
            form="pet-form"
            disabled={saving || owners.length === 0}
          >
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Add Pet"}
          </Button>
        </>
      }
    >
      <form id="pet-form" onSubmit={handleSubmit} noValidate>
        {errors.general && (
          <p
            className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {errors.general}
          </p>
        )}

        {/* Every pet needs an owner, so explain what to do first when there are no customers yet. */}
        {owners.length === 0 && (
          <p
            role="status"
            className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            There are no customers yet. Register the owner on the{" "}
            <Link to="/customers" className="font-medium underline">
              Customers
            </Link>{" "}
            page first, then come back to add the pet.
          </p>
        )}

        {/* One column on phones, two columns from the tablet breakpoint up. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Pet Name"
            htmlFor="name"
            required
            error={errors.name}
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
            label="Owner"
            htmlFor="customerId"
            required
            error={errors.customerId}
          >
            <select
              id="customerId"
              value={form.customerId}
              onChange={(event) =>
                handleChange("customerId", event.target.value)
              }
              className={inputClass(Boolean(errors.customerId))}
            >
              <option value="">Select an owner</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.fullName} ({owner.contactNumber})
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Species"
            htmlFor="species"
            required
            error={errors.species}
          >
            <select
              id="species"
              value={form.species}
              onChange={(event) => handleChange("species", event.target.value)}
              className={inputClass(Boolean(errors.species))}
            >
              <option value="">Select a species</option>
              {PET_SPECIES.map((species) => (
                <option key={species} value={species}>
                  {species}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Breed"
            htmlFor="breed"
            required
            error={errors.breed}
          >
            <input
              id="breed"
              type="text"
              placeholder="For example: Shih Tzu"
              value={form.breed}
              onChange={(event) => handleChange("breed", event.target.value)}
              className={inputClass(Boolean(errors.breed))}
            />
          </FormField>

          <FormField
            label="Date of Birth"
            htmlFor="birthDate"
            error={errors.birthDate}
            hint="Optional. The age is worked out from it."
          >
            <input
              id="birthDate"
              type="date"
              max={toISODate()}
              value={form.birthDate}
              onChange={(event) =>
                handleChange("birthDate", event.target.value)
              }
              className={inputClass(Boolean(errors.birthDate))}
            />
          </FormField>

          <FormField label="Sex" htmlFor="sex" required error={errors.sex}>
            <select
              id="sex"
              value={form.sex}
              onChange={(event) => handleChange("sex", event.target.value)}
              className={inputClass(Boolean(errors.sex))}
            >
              <option value="">Select the sex</option>
              {PET_SEXES.map((sex) => (
                <option key={sex} value={sex}>
                  {sex}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Notes"
            htmlFor="notes"
            error={errors.notes}
            hint="Optional"
            className="sm:col-span-2"
          >
            <textarea
              id="notes"
              rows={3}
              maxLength={300}
              placeholder="Coat condition, temperament, allergies..."
              value={form.notes}
              onChange={(event) => handleChange("notes", event.target.value)}
              className={textareaClass(Boolean(errors.notes))}
            />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
