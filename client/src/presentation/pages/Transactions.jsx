import { useEffect, useState } from "react";
import { Clock, Receipt, Undo2, Wallet } from "lucide-react";
import PageHeader from "../components/ui/PageHeader.jsx";
import StatCard from "../components/ui/StatCard.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";
import MessageDialog from "../components/ui/MessageDialog.jsx";
import NoticeBanner from "../components/ui/NoticeBanner.jsx";
import TransactionFilters from "../components/transactions/TransactionFilters.jsx";
import TransactionTable from "../components/transactions/TransactionTable.jsx";
import TransactionDetailsModal from "../components/transactions/TransactionDetailsModal.jsx";
import MarkPaidModal from "../components/transactions/MarkPaidModal.jsx";
import {
  checkRefund,
  filterTransactions,
  getTransactionList,
  getTransactionSummary,
  markTransactionPaid,
  refundTransaction,
} from "../../business/services/transactionService.js";
import {
  PAYMENT_METHODS,
  TRANSACTION_STATUSES,
} from "../../business/validators/transactionValidator.js";
import { formatCurrency, pluralize } from "../../business/utils/format.js";

const NO_FILTERS = { search: "", status: "", date: "" };

export default function Transactions() {
  // ---- STATE: everything this page needs to remember --------------------------------------------
  const [transactions, setTransactions] = useState([]); // the full list from the business layer
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [filters, setFilters] = useState(NO_FILTERS);

  const [selectedId, setSelectedId] = useState(null); // which transaction's details are open
  const [payTarget, setPayTarget] = useState(null); // which pending transaction is being marked as paid
  const [refundTarget, setRefundTarget] = useState(null); // which transaction we are asking to refund
  const [blockedMessage, setBlockedMessage] = useState(null); // { title, text } when an action is not allowed
  const [notice, setNotice] = useState(null); // { type: "success" | "error", text } message banner

  // ---- Load data once when the page opens -------------------------------------------------------
  useEffect(() => {
    getTransactionList()
      .then(setTransactions)
      .catch(() =>
        setLoadError("Could not load transactions. Please try again."),
      )
      .finally(() => setLoading(false));
  }, []);

  // ---- Helpers ----------------------------------------------------------------------------------
  async function reloadTransactions() {
    setTransactions(await getTransactionList());
  }

  function openMarkPaid(transaction) {
    setSelectedId(null); // close the details window if it was open
    setPayTarget(transaction);
  }

  // ---- Actions: the page asks the business layer to do the work, then shows the result ----------

  // Called by the "Mark as Paid" form. Returns the result so the form can show error messages.
  async function handleMarkPaid(form) {
    const result = await markTransactionPaid(payTarget.id, form);

    if (result.ok) {
      await reloadTransactions();
      setNotice({
        type: "success",
        text: `Transaction ${result.transaction.id} was marked as paid (${result.transaction.paymentMethod}).`,
      });
      setPayTarget(null);
    }
    return result;
  }

  // Step 1 of refunding: ask the business layer if it is allowed. If not, explain why. If yes, ask to confirm.
  async function askToRefund(transaction) {
    setSelectedId(null); // close the details window if it was open
    const check = await checkRefund(transaction.id);
    if (check.allowed) {
      setRefundTarget(transaction);
    } else {
      setBlockedMessage({ title: "Cannot refund", text: check.reason });
    }
  }

  // Step 2 of refunding: the user confirmed.
  async function handleConfirmRefund() {
    const target = refundTarget;
    setRefundTarget(null);

    const result = await refundTransaction(target.id);
    if (result.ok) {
      await reloadTransactions();
      setNotice({
        type: "success",
        text: `Transaction ${target.id} was refunded (${formatCurrency(target.amount)}).`,
      });
    } else {
      setBlockedMessage({ title: "Cannot refund", text: result.error });
    }
  }

  // ---- Loading and error screens ----------------------------------------------------------------
  if (loadError) return <p className="text-sm text-red-700">{loadError}</p>;
  if (loading)
    return <p className="text-sm text-muted">Loading transactions...</p>;

  // ---- Values worked out from state on every render ---------------------------------------------
  const summary = getTransactionSummary(transactions);
  const visibleTransactions = filterTransactions(transactions, filters);
  const hasFilters =
    filters.search !== "" || filters.status !== "" || filters.date !== "";
  const selectedTransaction = transactions.find(
    (transaction) => transaction.id === selectedId,
  );

  const emptyMessage =
    transactions.length === 0
      ? "No transactions yet. A transaction is created when an appointment is completed."
      : "No transactions match your search or filters.";

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Track payments for completed grooming appointments."
      />

      <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

      {/* Summary cards: 2 columns on phones, tablets and laptops, 4 columns on desktop. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Total Revenue"
          value={formatCurrency(summary.totalRevenue)}
          hint="From paid transactions"
        />
        <StatCard
          icon={Receipt}
          label="Total Transactions"
          value={summary.totalTransactions}
          hint="All payment records"
        />
        <StatCard
          icon={Clock}
          label="Pending Payments"
          value={summary.pendingCount}
          hint={`${formatCurrency(summary.pendingAmount)} waiting to be paid`}
        />
        <StatCard
          icon={Undo2}
          label="Refunded Amount"
          value={formatCurrency(summary.refundedAmount)}
          hint={pluralize(summary.refundedCount, "refund")}
        />
      </div>

      <div className="mt-4 space-y-4 sm:mt-6">
        <TransactionFilters
          filters={filters}
          statuses={TRANSACTION_STATUSES}
          hasFilters={hasFilters}
          onChange={setFilters}
          onReset={() => setFilters(NO_FILTERS)}
        />

        <p className="text-sm text-muted">
          Showing {visibleTransactions.length} of {transactions.length}{" "}
          transactions
        </p>

        <TransactionTable
          transactions={visibleTransactions}
          emptyMessage={emptyMessage}
          onView={(transaction) => setSelectedId(transaction.id)}
          onMarkPaid={openMarkPaid}
          onRefund={askToRefund}
        />
      </div>

      {/* Pop-ups. Each one is only on the screen while its state says it should be. */}
      {selectedTransaction && (
        <TransactionDetailsModal
          transaction={selectedTransaction}
          onClose={() => setSelectedId(null)}
          onMarkPaid={openMarkPaid}
          onRefund={askToRefund}
        />
      )}

      {payTarget && (
        <MarkPaidModal
          transaction={payTarget}
          methods={PAYMENT_METHODS}
          onSave={handleMarkPaid}
          onClose={() => setPayTarget(null)}
        />
      )}

      {refundTarget && (
        <ConfirmDialog
          title="Refund transaction?"
          message={`Refund ${formatCurrency(refundTarget.amount)} for ${refundTarget.pet} (${refundTarget.id})? This cannot be undone.`}
          confirmLabel="Refund"
          cancelLabel="Keep Payment"
          onConfirm={handleConfirmRefund}
          onCancel={() => setRefundTarget(null)}
        />
      )}

      {blockedMessage && (
        <MessageDialog
          title={blockedMessage.title}
          message={blockedMessage.text}
          onClose={() => setBlockedMessage(null)}
        />
      )}
    </>
  );
}
