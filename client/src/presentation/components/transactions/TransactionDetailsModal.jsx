import Modal from "../ui/Modal.jsx";
import Button from "../ui/Button.jsx";
import TransactionStatusBadge from "./TransactionStatusBadge.jsx";
import {
  canMarkPaid,
  canRefund,
} from "../../../business/services/transactionService.js";
import {
  formatCurrency,
  formatShortDate,
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

// Shows everything about one transaction. The customer, pet and service names were added by the business layer.
// The buttons at the bottom only appear when the status allows them.
export default function TransactionDetailsModal({
  transaction,
  onClose,
  onMarkPaid,
  onRefund,
}) {
  return (
    <Modal
      title={`Transaction ${transaction.id}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {canMarkPaid(transaction.status) && (
            <Button onClick={() => onMarkPaid(transaction)}>
              Mark as Paid
            </Button>
          )}
          {canRefund(transaction.status) && (
            <Button
              variant="danger-outline"
              onClick={() => onRefund(transaction)}
            >
              Refund
            </Button>
          )}
        </>
      }
    >
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Detail label="Status">
          <TransactionStatusBadge status={transaction.status} />
        </Detail>
        <Detail label="Amount">{formatCurrency(transaction.amount)}</Detail>
        <Detail label="Appointment ID">{transaction.appointmentId}</Detail>
        <Detail label="Service">{transaction.service}</Detail>
        <Detail label="Owner">{transaction.customer}</Detail>
        <Detail label="Pet">
          {transaction.pet}{" "}
          <span className="text-muted">· {transaction.species}</span>
        </Detail>
        <Detail label="Transaction Date">
          {formatShortDate(transaction.date)}
        </Detail>
        <Detail label="Payment Method">
          {transaction.paymentMethod || (
            <span className="text-muted">Not paid yet</span>
          )}
        </Detail>
        <Detail label="Date Paid">
          {transaction.paidDate ? (
            formatShortDate(transaction.paidDate)
          ) : (
            <span className="text-muted">Not paid yet</span>
          )}
        </Detail>
      </dl>
    </Modal>
  );
}
