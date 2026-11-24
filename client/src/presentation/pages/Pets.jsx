import { useEffect, useState } from "react";
import { Bird, Cat, Dog, PawPrint, Plus } from "lucide-react";
import PageHeader from "../components/ui/PageHeader.jsx";
import StatCard from "../components/ui/StatCard.jsx";
import Button from "../components/ui/Button.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";
import MessageDialog from "../components/ui/MessageDialog.jsx";
import NoticeBanner from "../components/ui/NoticeBanner.jsx";
import PetFilters from "../components/pets/PetFilters.jsx";
import PetTable from "../components/pets/PetTable.jsx";
import PetFormModal from "../components/pets/PetFormModal.jsx";
import PetDetailsModal from "../components/pets/PetDetailsModal.jsx";
import {
  checkPetDeletion,
  createPet,
  deletePet,
  filterPets,
  getOwnerOptions,
  getPetList,
  getPetSummary,
  updatePet,
} from "../../business/services/petService.js";
import { PET_SPECIES } from "../../business/validators/petValidator.js";

const NO_FILTERS = { search: "", species: "" };

export default function Pets() {
  // ---- STATE: everything this page needs to remember --------------------------------------------
  const [pets, setPets] = useState([]); // the full list from the business layer (each pet includes its owner's name)
  const [owners, setOwners] = useState([]); // the customers for the form's Owner dropdown
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [filters, setFilters] = useState(NO_FILTERS);

  const [showForm, setShowForm] = useState(false); // is the add/edit form open?
  const [editingPet, setEditingPet] = useState(null); // null = adding a new pet
  const [selectedId, setSelectedId] = useState(null); // which pet's details are open
  const [deleteTarget, setDeleteTarget] = useState(null); // which pet we are asking to delete
  const [blockedMessage, setBlockedMessage] = useState(null); // { title, text } when a delete is not allowed
  const [notice, setNotice] = useState(null); // { type: "success" | "error", text } message banner

  // ---- Load data once when the page opens -------------------------------------------------------
  useEffect(() => {
    Promise.all([getPetList(), getOwnerOptions()])
      .then(([petList, ownerList]) => {
        setPets(petList);
        setOwners(ownerList);
      })
      .catch(() => setLoadError("Could not load pets. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  // ---- Helpers ----------------------------------------------------------------------------------
  async function reloadPets() {
    setPets(await getPetList());
  }

  function openNewForm() {
    setEditingPet(null);
    setShowForm(true);
  }

  function openEditForm(pet) {
    setSelectedId(null); // close the details window if it was open
    setEditingPet(pet);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingPet(null);
  }

  // ---- Actions: the page asks the business layer to do the work, then shows the result ----------

  // Called by the form. Returns the result so the form can show error messages.
  async function handleSave(form) {
    const result = editingPet
      ? await updatePet(editingPet.id, form)
      : await createPet(form);

    if (result.ok) {
      await reloadPets();

      let text = `Pet ${result.pet.id} ${editingPet ? "updated" : "added"}.`;
      if (editingPet && editingPet.customerId !== form.customerId) {
        text += " Its open appointments now belong to the new owner.";
      }
      setNotice({ type: "success", text });
      closeForm();
    }
    return result;
  }

  // Step 1 of deleting: ask the business layer if it is allowed. If not, explain why. If yes, ask to confirm.
  async function askToDelete(pet) {
    setSelectedId(null); // close the details window if it was open
    const check = await checkPetDeletion(pet.id);
    if (check.allowed) {
      setDeleteTarget(pet);
    } else {
      setBlockedMessage({ title: "Pet cannot be deleted", text: check.reason });
    }
  }

  // Step 2 of deleting: the user confirmed.
  async function handleConfirmDelete() {
    const target = deleteTarget;
    setDeleteTarget(null);

    const result = await deletePet(target.id);
    if (result.ok) {
      await reloadPets();
      setNotice({
        type: "success",
        text: `Pet ${target.id} (${target.name}) was deleted.`,
      });
    } else {
      setBlockedMessage({ title: "Pet cannot be deleted", text: result.error });
    }
  }

  // ---- Loading and error screens ----------------------------------------------------------------
  if (loadError) return <p className="text-sm text-red-700">{loadError}</p>;
  if (loading) return <p className="text-sm text-muted">Loading pets...</p>;

  // ---- Values worked out from state on every render ---------------------------------------------
  const summary = getPetSummary(pets);
  const visiblePets = filterPets(pets, filters);
  const hasFilters = filters.search !== "" || filters.species !== "";
  const selectedPet = pets.find((pet) => pet.id === selectedId);

  const emptyMessage =
    pets.length === 0
      ? "No pets yet. Click “Add Pet” to register the first one."
      : "No pets match your search or filters.";

  return (
    <>
      <PageHeader
        title="Pets"
        subtitle="Manage registered pets and their owners."
      >
        <Button onClick={openNewForm} className="w-full sm:w-auto">
          <Plus size={18} />
          Add Pet
        </Button>
      </PageHeader>

      <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

      {/* Summary cards: 2 columns on phones, tablets and laptops, 4 columns on desktop. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          icon={PawPrint}
          label="Total Pets"
          value={summary.total}
          hint="All registered pets"
        />
        <StatCard icon={Dog} label="Dogs" value={summary.dogs} />
        <StatCard icon={Cat} label="Cats" value={summary.cats} />
        <StatCard
          icon={Bird}
          label="Other Animals"
          value={summary.other}
          hint="Rabbits, birds and more"
        />
      </div>

      <div className="mt-4 space-y-4 sm:mt-6">
        <PetFilters
          filters={filters}
          speciesOptions={PET_SPECIES}
          hasFilters={hasFilters}
          onChange={setFilters}
          onReset={() => setFilters(NO_FILTERS)}
        />

        <p className="text-sm text-muted">
          Showing {visiblePets.length} of {pets.length} pets
        </p>

        <PetTable
          pets={visiblePets}
          emptyMessage={emptyMessage}
          onView={(pet) => setSelectedId(pet.id)}
          onEdit={openEditForm}
          onDelete={askToDelete}
        />
      </div>

      {/* Pop-ups. Each one is only on the screen while its state says it should be. */}
      {showForm && (
        <PetFormModal
          pet={editingPet}
          owners={owners}
          onSave={handleSave}
          onClose={closeForm}
        />
      )}

      {selectedPet && (
        <PetDetailsModal
          pet={selectedPet}
          onClose={() => setSelectedId(null)}
          onEdit={openEditForm}
          onDelete={askToDelete}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete pet?"
          message={`Delete ${deleteTarget.name} (${deleteTarget.id}), owned by ${deleteTarget.ownerName}? This cannot be undone.`}
          confirmLabel="Delete Pet"
          cancelLabel="Keep Pet"
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
