import Modal from "./Modal.jsx";
import Button from "./Button.jsx";

// A small "Are you sure?" pop-up for actions that cannot be undone.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Go Back",
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{message}</p>
    </Modal>
  );
}
