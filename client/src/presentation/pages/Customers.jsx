import { useEffect, useState } from "react";
import { PawPrint, Plus, UserCheck, UserPlus, Users } from "lucide-react";
import PageHeader from "../components/ui/PageHeader.jsx";
import StatCard from "../components/ui/StatCard.jsx";
import Button from "../components/ui/Button.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";
import MessageDialog from "../components/ui/MessageDialog.jsx";
import NoticeBanner from "../components/ui/NoticeBanner.jsx";
import CustomerFilters from "../components/customers/CustomerFilters.jsx";
import CustomerTable from "../components/customers/CustomerTable.jsx";
import CustomerFormModal from "../components/customers/CustomerFormModal.jsx";
import CustomerDetailsModal from "../components/customers/CustomerDetailsModal.jsx";
import {
  CUSTOMER_SORT_OPTIONS,
  checkCustomerDeletion,
  createCustomer,
  deleteCustomer,
  filterCustomers,
  getCustomerList,
  getCustomerSummary,
  sortCustomers,
  updateCustomer,
} from "../../business/services/customerService.js";

const NO_FILTERS = { search: "", sort: "name" };

export default function Customers() {
  // ---- STATE: everything this page needs to remember --------------------------------------------
  const [customers, setCustomers] = useState([]); // the full list from the business layer
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [filters, setFilters] = useState(NO_FILTERS);

  const [showForm, setShowForm] = useState(false); // is the add/edit form open?
  const [editingCustomer, setEditingCustomer] = useState(null); // null = adding a new customer
  const [selectedId, setSelectedId] = useState(null); // which customer's details are open
  const [deleteTarget, setDeleteTarget] = useState(null); // which customer we are asking to delete
  const [blockedMessage, setBlockedMessage] = useState(null); // { title, text } when a delete is not allowed
  const [notice, setNotice] = useState(null); // { type: "success" | "error", text } message banner

  // ---- Load data once when the page opens -------------------------------------------------------
  useEffect(() => {
    getCustomerList()
      .then(setCustomers)
      .catch(() => setLoadError("Could not load customers. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  // ---- Helpers ----------------------------------------------------------------------------------
  async function reloadCustomers() {
    setCustomers(await getCustomerList());
  }

  function openNewForm() {
    setEditingCustomer(null);
    setShowForm(true);
  }

  function openEditForm(customer) {
    setSelectedId(null); // close the details window if it was open
    setEditingCustomer(customer);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingCustomer(null);
  }

  // ---- Actions: the page asks the business layer to do the work, then shows the result ----------

  // Called by the form. Returns the result so the form can show error messages.
  async function handleSave(form) {
    const result = editingCustomer
      ? await updateCustomer(editingCustomer.id, form)
      : await createCustomer(form);

    if (result.ok) {
      await reloadCustomers();
      setNotice({
        type: "success",
        text: `Customer ${result.customer.id} ${editingCustomer ? "updated" : "added"}.`,
      });
      closeForm();
    }
    return result;
  }

  // Step 1 of deleting: ask the business layer if it is allowed. If not, explain why. If yes, ask to confirm.
  async function askToDelete(customer) {
    setSelectedId(null); // close the details window if it was open
    const check = await checkCustomerDeletion(customer.id);
    if (check.allowed) {
      setDeleteTarget(customer);
    } else {
      setBlockedMessage({
        title: "Customer cannot be deleted",
        text: check.reason,
      });
    }
  }

  // Step 2 of deleting: the user confirmed.
  async function handleConfirmDelete() {
    const target = deleteTarget;
    setDeleteTarget(null);

    const result = await deleteCustomer(target.id);
    if (result.ok) {
      await reloadCustomers();
      setNotice({
        type: "success",
        text: `Customer ${target.id} (${target.fullName}) was deleted.`,
      });
    } else {
      setBlockedMessage({
        title: "Customer cannot be deleted",
        text: result.error,
      });
    }
  }

  // ---- Loading and error screens ----------------------------------------------------------------
  if (loadError) return <p className="text-sm text-red-700">{loadError}</p>;
  if (loading)
    return <p className="text-sm text-muted">Loading customers...</p>;

  // ---- Values worked out from state on every render ---------------------------------------------
  const summary = getCustomerSummary(customers);
  const visibleCustomers = sortCustomers(
    filterCustomers(customers, filters.search),
    filters.sort,
  );
  const hasFilters = filters.search !== "" || filters.sort !== NO_FILTERS.sort;
  const selectedCustomer = customers.find(
    (customer) => customer.id === selectedId,
  );

  const emptyMessage =
    customers.length === 0
      ? "No customers yet. Click “Add Customer” to register the first one."
      : "No customers match your search.";

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Manage pet owners and their contact information."
      >
        <Button onClick={openNewForm} className="w-full sm:w-auto">
          <Plus size={18} />
          Add Customer
        </Button>
      </PageHeader>

      <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

      {/* Summary cards: 2 columns on phones, tablets and laptops, 4 columns on desktop. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total Customers"
          value={summary.total}
          hint="All registered owners"
        />
        <StatCard
          icon={UserPlus}
          label="New This Month"
          value={summary.newThisMonth}
          hint="Registered this month"
        />
        <StatCard
          icon={UserCheck}
          label="Customers with Pets"
          value={summary.withPets}
          hint={`${summary.total - summary.withPets} without pets`}
        />
        <StatCard
          icon={PawPrint}
          label="Registered Pets"
          value={summary.totalPets}
          hint="Across all customers"
        />
      </div>

      <div className="mt-4 space-y-4 sm:mt-6">
        <CustomerFilters
          filters={filters}
          sortOptions={CUSTOMER_SORT_OPTIONS}
          hasFilters={hasFilters}
          onChange={setFilters}
          onReset={() => setFilters(NO_FILTERS)}
        />

        <p className="text-sm text-muted">
          Showing {visibleCustomers.length} of {customers.length} customers
        </p>

        <CustomerTable
          customers={visibleCustomers}
          emptyMessage={emptyMessage}
          onView={(customer) => setSelectedId(customer.id)}
          onEdit={openEditForm}
          onDelete={askToDelete}
        />
      </div>

      {/* Pop-ups. Each one is only on the screen while its state says it should be. */}
      {showForm && (
        <CustomerFormModal
          customer={editingCustomer}
          onSave={handleSave}
          onClose={closeForm}
        />
      )}

      {selectedCustomer && (
        <CustomerDetailsModal
          customer={selectedCustomer}
          onClose={() => setSelectedId(null)}
          onEdit={openEditForm}
          onDelete={askToDelete}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete customer?"
          message={`Delete ${deleteTarget.fullName} (${deleteTarget.id})? This cannot be undone.`}
          confirmLabel="Delete Customer"
          cancelLabel="Keep Customer"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
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
