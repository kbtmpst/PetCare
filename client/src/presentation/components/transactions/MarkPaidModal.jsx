import { useState } from "react";
import Modal from "../ui/Modal.jsx";
import Button from "../ui/Button.jsx";
import FormField, { inputClass } from "../ui/FormField.jsx";
import { formatCurrency } from "../../../business/utils/format.js";

// A small form that asks how the customer paid, then marks the transaction as Paid.
//   transaction: the pending transaction
//   methods:     the choices for the Payment Method dropdown (["Cash", "GCash", "Card"])
//   onSave:      async function(form) -> { ok, errors }. The page does the saving.
//   onClose:     closes the modal without saving
export default function MarkPaidModal({
  transaction,
  methods,
  onSave,
  onClose,
}) {
  // STATE: the chosen method, the error messages, and whether we are saving right now.
  const [paymentMethod, setPaymentMethod] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault(); // stop the browser from reloading the page
    setSaving(true);
    const result = await onSave({ paymentMethod }); // the page saves it; the business layer validates it
    setSaving(false);
    if (!result.ok) setErrors(result.errors || { general: result.error });
  }

  return (
    <Modal
      title="Mark as Paid"
      size="sm"
      onClose={onClose}
      closeOnBackgroundClick={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Discard
          </Button>
          <Button type="submit" form="mark-paid-form" disabled={saving}>
            {saving ? "Saving..." : "Confirm Payment"}
          </Button>
        </>
      }
    >
      <form id="mark-paid-form" onSubmit={handleSubmit} noValidate>
        <p className="mb-4 text-sm text-muted">
          {transaction.id} · {transaction.pet} ({transaction.customer}) ·{" "}
          <span className="font-medium text-ink">
            {formatCurrency(transaction.amount)}
          </span>
        </p>

        {errors.general && (
          <p
            className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {errors.general}
          </p>
        )}

        <FormField
          label="Payment Method"
          htmlFor="paymentMethod"
          required
          error={errors.paymentMethod}
        >
          <select
            id="paymentMethod"
            value={paymentMethod}
            onChange={(event) => {
              setPaymentMethod(event.target.value);
              setErrors({});
            }}
            className={inputClass(Boolean(errors.paymentMethod))}
          >
            <option value="">Select a method</option>
            {methods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </FormField>
      </form>
    </Modal>
  );
}
