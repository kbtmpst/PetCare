import { useEffect, useState } from "react";
import { Ban, ClipboardCheck, Plus, Scissors, Wallet } from "lucide-react";
import PageHeader from "../components/ui/PageHeader.jsx";
import StatCard from "../components/ui/StatCard.jsx";
import Button from "../components/ui/Button.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";
import MessageDialog from "../components/ui/MessageDialog.jsx";
import NoticeBanner from "../components/ui/NoticeBanner.jsx";
import ServiceFilters from "../components/services/ServiceFilters.jsx";
import ServiceTable from "../components/services/ServiceTable.jsx";
import ServiceFormModal from "../components/services/ServiceFormModal.jsx";
import ServiceDetailsModal from "../components/services/ServiceDetailsModal.jsx";
import {
  SERVICE_STATUS_FILTERS,
  checkServiceDeletion,
  createService,
  deleteService,
  filterServices,
  getServiceList,
  getServiceSummary,
  updateService,
} from "../../business/services/serviceService.js";
import { SERVICE_STATUSES } from "../../business/validators/serviceValidator.js";
import { formatCurrency } from "../../business/utils/format.js";

const NO_FILTERS = { search: "", status: "" };

export default function Services() {
  // ---- STATE: everything this page needs to remember --------------------------------------------
  const [services, setServices] = useState([]); // the full list from the business layer
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [filters, setFilters] = useState(NO_FILTERS);

  const [showForm, setShowForm] = useState(false); // is the add/edit form open?
  const [editingService, setEditingService] = useState(null); // null = adding a new service
  const [selectedId, setSelectedId] = useState(null); // which service's details are open
  const [deleteTarget, setDeleteTarget] = useState(null); // which service we are asking to delete
  const [blockedMessage, setBlockedMessage] = useState(null); // { title, text } when a delete is not allowed
  const [notice, setNotice] = useState(null); // { type: "success" | "error", text } message banner

  // ---- Load data once when the page opens -------------------------------------------------------
  useEffect(() => {
    getServiceList()
      .then(setServices)
      .catch(() => setLoadError("Could not load services. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  // ---- Helpers ----------------------------------------------------------------------------------
  async function reloadServices() {
    setServices(await getServiceList());
  }

  function openNewForm() {
    setEditingService(null);
    setShowForm(true);
  }

  function openEditForm(service) {
    setSelectedId(null); // close the details window if it was open
    setEditingService(service);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingService(null);
  }

  // ---- Actions: the page asks the business layer to do the work, then shows the result ----------

  // Called by the form. Returns the result so the form can show error messages.
  async function handleSave(form) {
    const result = editingService
      ? await updateService(editingService.id, form)
      : await createService(form);

    if (result.ok) {
      await reloadServices();
      setNotice({
        type: "success",
        text: `Service "${result.service.name}" ${editingService ? "updated" : "added"}.`,
      });
      closeForm();
    }
    return result;
  }

  // Step 1 of deleting: ask the business layer if it is allowed. If not, explain why. If yes, ask to confirm.
  async function askToDelete(service) {
    setSelectedId(null); // close the details window if it was open
    const check = await checkServiceDeletion(service.id);
    if (check.allowed) {
      setDeleteTarget(service);
    } else {
      setBlockedMessage({
        title: "Service cannot be deleted",
        text: check.reason,
      });
    }
  }

  // Step 2 of deleting: the user confirmed.
  async function handleConfirmDelete() {
    const target = deleteTarget;
    setDeleteTarget(null);

    const result = await deleteService(target.id);
    if (result.ok) {
      await reloadServices();
      setNotice({
        type: "success",
        text: `Service "${target.name}" was deleted.`,
      });
    } else {
      setBlockedMessage({
        title: "Service cannot be deleted",
        text: result.error,
      });
    }
  }

  // ---- Loading and error screens ----------------------------------------------------------------
  if (loadError) return <p className="text-sm text-red-700">{loadError}</p>;
  if (loading) return <p className="text-sm text-muted">Loading services...</p>;

  // ---- Values worked out from state on every render ---------------------------------------------
  const summary = getServiceSummary(services);
  const visibleServices = filterServices(services, filters);
  const hasFilters = filters.search !== "" || filters.status !== "";
  const selectedService = services.find((service) => service.id === selectedId);

  const emptyMessage =
    services.length === 0
      ? "No services yet. Click “Add Service” to create the first one."
      : "No services match your search or filters.";

  return (
    <>
      <PageHeader
        title="Services"
        subtitle="Manage the grooming services you offer, with their prices and durations."
      >
        <Button onClick={openNewForm} className="w-full sm:w-auto">
          <Plus size={18} />
          Add Service
        </Button>
      </PageHeader>

      <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

      {/* Summary cards: 2 columns on phones, tablets and laptops, 4 columns on desktop. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          icon={Scissors}
          label="Total Services"
          value={summary.total}
          hint="All services"
        />
        <StatCard
          icon={ClipboardCheck}
          label="Active"
          value={summary.active}
          hint="Can be booked"
        />
        <StatCard
          icon={Ban}
          label="Inactive"
          value={summary.inactive}
          hint="Not offered right now"
        />
        <StatCard
          icon={Wallet}
          label="Average Price"
          value={formatCurrency(summary.averagePrice)}
          hint="Across all services"
        />
      </div>

      <div className="mt-4 space-y-4 sm:mt-6">
        <ServiceFilters
          filters={filters}
          statusOptions={SERVICE_STATUS_FILTERS}
          hasFilters={hasFilters}
          onChange={setFilters}
          onReset={() => setFilters(NO_FILTERS)}
        />

        <p className="text-sm text-muted">
          Showing {visibleServices.length} of {services.length} services
        </p>

        <ServiceTable
          services={visibleServices}
          emptyMessage={emptyMessage}
          onView={(service) => setSelectedId(service.id)}
          onEdit={openEditForm}
          onDelete={askToDelete}
        />
      </div>

      {/* Pop-ups. Each one is only on the screen while its state says it should be. */}
      {showForm && (
        <ServiceFormModal
          service={editingService}
          statuses={SERVICE_STATUSES}
          onSave={handleSave}
          onClose={closeForm}
        />
      )}

      {selectedService && (
        <ServiceDetailsModal
          service={selectedService}
          onClose={() => setSelectedId(null)}
          onEdit={openEditForm}
          onDelete={askToDelete}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete service?"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete Service"
          cancelLabel="Keep Service"
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
