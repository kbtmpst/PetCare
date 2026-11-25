import { Check, Eye, Undo2 } from "lucide-react";
import Card from "../ui/Card.jsx";
import IconButton from "../ui/IconButton.jsx";
import TransactionStatusBadge from "./TransactionStatusBadge.jsx";
import {
  canMarkPaid,
  canRefund,
} from "../../../business/services/transactionService.js";
import {
  formatCurrency,
  formatShortDate,
} from "../../../business/utils/format.js";

// Shared classes so every header cell and every body cell look the same.
const thClass = "whitespace-nowrap px-4 py-3 font-semibold";
const tdClass = "whitespace-nowrap px-4 py-3";

// The transactions table. On small screens it keeps a minimum width and the card scrolls sideways,
// so the columns never get squeezed too narrow to read.
// Each row has View, and either "Mark as paid" (Pending) or "Refund" (Paid). Refunded rows only have View.
export default function TransactionTable({
  transactions,
  emptyMessage,
  onView,
  onMarkPaid,
  onRefund,
}) {
  return (
    <Card bodyClassName="p-0">
      {transactions.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-line bg-sage-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className={thClass}>Transaction ID</th>
                <th className={thClass}>Appointment ID</th>
                <th className={thClass}>Owner</th>
                <th className={thClass}>Pet</th>
                <th className={thClass}>Service</th>
                <th className={thClass}>Date</th>
                <th className={thClass}>Payment Method</th>
                <th className={`${thClass} text-right`}>Amount</th>
                <th className={thClass}>Status</th>
                <th className={`${thClass} text-right`}>Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-sage-50/60">
                  <td className={`${tdClass} font-medium`}>{transaction.id}</td>
                  <td className={tdClass}>{transaction.appointmentId}</td>
                  <td className={tdClass}>{transaction.customer}</td>
                  <td className={tdClass}>
                    {transaction.pet}{" "}
                    <span className="text-muted">· {transaction.species}</span>
                  </td>
                  <td className={tdClass}>{transaction.service}</td>
                  <td className={tdClass}>
                    {formatShortDate(transaction.date)}
                  </td>
                  <td className={tdClass}>
                    {transaction.paymentMethod || (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className={`${tdClass} text-right font-medium`}>
                    {formatCurrency(transaction.amount)}
                  </td>
                  <td className={tdClass}>
                    <TransactionStatusBadge status={transaction.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        label={`View ${transaction.id}`}
                        onClick={() => onView(transaction)}
                      >
                        <Eye size={18} />
                      </IconButton>
                      {canMarkPaid(transaction.status) && (
                        <IconButton
                          label={`Mark ${transaction.id} as paid`}
                          onClick={() => onMarkPaid(transaction)}
                        >
                          <Check size={18} />
                        </IconButton>
                      )}
                      {canRefund(transaction.status) && (
                        <IconButton
                          label={`Refund ${transaction.id}`}
                          danger
                          onClick={() => onRefund(transaction)}
                        >
                          <Undo2 size={18} />
                        </IconButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
