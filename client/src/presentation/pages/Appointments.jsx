import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  ClipboardCheck,
  Clock,
  Plus,
  Scissors,
} from "lucide-react";
import PageHeader from "../components/ui/PageHeader.jsx";
import StatCard from "../components/ui/StatCard.jsx";
import Button from "../components/ui/Button.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";
import NoticeBanner from "../components/ui/NoticeBanner.jsx";
import AppointmentFilters from "../components/appointments/AppointmentFilters.jsx";
import AppointmentTable from "../components/appointments/AppointmentTable.jsx";
import AppointmentFormModal from "../components/appointments/AppointmentFormModal.jsx";
import AppointmentDetailsModal from "../components/appointments/AppointmentDetailsModal.jsx";
import {
  APPOINTMENT_STATUSES,
  cancelAppointment,
  changeAppointmentStatus,
  createAppointment,
  filterAppointments,
  getAppointmentList,
  getAppointmentSummary,
  getFormOptions,
  updateAppointment,
} from "../../business/services/appointmentService.js";
import { formatShortDate, formatTime } from "../../business/utils/format.js";

const NO_FILTERS = { search: "", status: "", date: "" };

export default function Appointments() {
  // The header search box sends people here with /appointments?search=something
  const [searchParams] = useSearchParams();

  // ---- STATE: everything this page needs to remember --------------------------------------------
  const [appointments, setAppointments] = useState([]); // the full list from the business layer
  const [options, setOptions] = useState({ pets: [], services: [] }); // dropdown choices for the form
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [filters, setFilters] = useState({
    ...NO_FILTERS,
    search: searchParams.get("search") ?? "",
  });

  const [showForm, setShowForm] = useState(false); // is the add/edit form open?
  const [editingAppointment, setEditingAppointment] = useState(null); // null = adding a new one
  const [selectedId, setSelectedId] = useState(null); // which appointment's details are open
  const [cancelTarget, setCancelTarget] = useState(null); // which appointment we are asking to cancel
  const [notice, setNotice] = useState(null); // { type: "success" | "error", text } message banner

  // ---- Load data once when the page opens -------------------------------------------------------
  useEffect(() => {
    Promise.all([getAppointmentList(), getFormOptions()])
      .then(([list, formOptions]) => {
        setAppointments(list);
        setOptions(formOptions);
      })
      .catch(() =>
        setLoadError("Could not load appointments. Please try again."),
      )
      .finally(() => setLoading(false));
  }, []);

  // If the header search is used while we are already on this page, copy the new search into the filters.
  useEffect(() => {
    setFilters((current) => ({
      ...current,
      search: searchParams.get("search") ?? "",
    }));
  }, [searchParams]);

  // ---- Helpers ----------------------------------------------------------------------------------
  async function reloadAppointments() {
    setAppointments(await getAppointmentList());
  }

  function openNewForm() {
    setEditingAppointment(null);
    setShowForm(true);
  }

  function openEditForm(appointment) {
    setSelectedId(null); // close the details window if it was open
    setEditingAppointment(appointment);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingAppointment(null);
  }

  function askToCancel(appointment) {
    setSelectedId(null); // close the details window if it was open
    setCancelTarget(appointment);
  }

  // ---- Actions: the page asks the business layer to do the work, then shows the result ----------

  // Called by the form. Returns the result so the form can show error messages.
  async function handleSave(form) {
    const result = editingAppointment
      ? await updateAppointment(editingAppointment.id, form)
      : await createAppointment(form);

    if (result.ok) {
      await reloadAppointments();
      setNotice({
        type: "success",
        text: `Appointment ${result.appointment.id} ${editingAppointment ? "updated" : "created"}.`,
      });
      closeForm();
    }
    return result;
  }

  async function handleStatusChange(appointment, newStatus) {
    const result = await changeAppointmentStatus(appointment.id, newStatus);
    await reloadAppointments();
    setNotice(
      result.ok
        ? {
            type: "success",
            text: `Appointment ${appointment.id} is now ${newStatus}.`,
          }
        : { type: "error", text: result.error },
    );
  }

  async function handleConfirmCancel() {
    const target = cancelTarget;
    setCancelTarget(null);

    const result = await cancelAppointment(target.id);
    await reloadAppointments();
    setNotice(
      result.ok
        ? { type: "success", text: `Appointment ${target.id} was cancelled.` }
        : { type: "error", text: result.error },
    );
  }

  // ---- Loading and error screens ----------------------------------------------------------------
  if (loadError) return <p className="text-sm text-red-700">{loadError}</p>;
  if (loading)
    return <p className="text-sm text-muted">Loading appointments...</p>;

  // ---- Values worked out from state on every render ---------------------------------------------
  const summary = getAppointmentSummary(appointments);
  const visibleAppointments = filterAppointments(appointments, filters);
  const hasFilters =
    filters.search !== "" || filters.status !== "" || filters.date !== "";
  const selectedAppointment = appointments.find(
    (appointment) => appointment.id === selectedId,
  );

  const emptyMessage =
    appointments.length === 0
      ? "No appointments yet. Click “New Appointment” to add one."
      : "No appointments match your search or filters.";

  return (
    <>
      <PageHeader
        title="Appointments"
        subtitle="Manage grooming schedules and appointment status."
      >
        <Button onClick={openNewForm} className="w-full sm:w-auto">
          <Plus size={18} />
          New Appointment
        </Button>
      </PageHeader>

      <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

      {/* Summary cards: 2 columns on phones, tablets and laptops, 4 columns on desktop. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          icon={CalendarDays}
          label="Today's Appointments"
          value={summary.today}
          hint="Not counting cancelled"
        />
        <StatCard
          icon={Clock}
          label="Pending"
          value={summary.pending}
          hint="Waiting for confirmation"
        />
        <StatCard
          icon={Scissors}
          label="In Progress"
          value={summary.inProgress}
          hint="Being groomed now"
        />
        <StatCard
          icon={ClipboardCheck}
          label="Completed"
          value={summary.completed}
          hint="All finished appointments"
        />
      </div>

      <div className="mt-4 space-y-4 sm:mt-6">
        <AppointmentFilters
          filters={filters}
          statuses={APPOINTMENT_STATUSES}
          hasFilters={hasFilters}
          onChange={setFilters}
          onReset={() => setFilters(NO_FILTERS)}
        />

        <p className="text-sm text-muted">
          Showing {visibleAppointments.length} of {appointments.length}{" "}
          appointments
        </p>

        <AppointmentTable
          appointments={visibleAppointments}
          emptyMessage={emptyMessage}
          onView={(appointment) => setSelectedId(appointment.id)}
          onEdit={openEditForm}
          onStatusChange={handleStatusChange}
          onCancel={askToCancel}
        />
      </div>

      {/* Pop-ups. Each one is only on the screen while its state says it should be. */}
      {showForm && (
        <AppointmentFormModal
          appointment={editingAppointment}
          options={options}
          onSave={handleSave}
          onClose={closeForm}
        />
      )}

      {selectedAppointment && (
        <AppointmentDetailsModal
          appointment={selectedAppointment}
          onClose={() => setSelectedId(null)}
          onEdit={openEditForm}
          onStatusChange={handleStatusChange}
          onCancel={askToCancel}
        />
      )}

      {cancelTarget && (
        <ConfirmDialog
          title="Cancel appointment?"
          message={`Cancel ${cancelTarget.id} for ${cancelTarget.pet} (${cancelTarget.customer}) on ${formatShortDate(
            cancelTarget.date,
          )} at ${formatTime(cancelTarget.time)}? A cancelled appointment cannot be changed afterwards.`}
          confirmLabel="Cancel Appointment"
          cancelLabel="Keep Appointment"
          onConfirm={handleConfirmCancel}
          onCancel={() => setCancelTarget(null)}
        />
      )}
    </>
  );
}
