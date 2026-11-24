import Modal from "./Modal.jsx";
import Button from "./Button.jsx";

// A small pop-up that explains why something was not allowed, with a single OK button.
// (Unlike the banner, it stays until the user closes it, so a long explanation can be read calmly.)
export default function MessageDialog({
  title,
  message,
  buttonLabel = "OK",
  onClose,
}) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onClose}
      footer={<Button onClick={onClose}>{buttonLabel}</Button>}
    >
      <p className="text-sm text-muted">{message}</p>
    </Modal>
  );
}
