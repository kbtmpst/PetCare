import { Eye, Pencil, Trash2 } from "lucide-react";
import Card from "../ui/Card.jsx";
import IconButton from "../ui/IconButton.jsx";
import { formatAge } from "../../../business/utils/format.js";

// Shared classes so every header cell and every body cell look the same.
const thClass = "whitespace-nowrap px-4 py-3 font-semibold";
const tdClass = "whitespace-nowrap px-4 py-3";

// The pets table. The Owner column shows the owner's name with their contact number underneath,
// so staff can tell owners with the same name apart and call them straight away.
// On small screens the table keeps a minimum width and the card scrolls sideways.
export default function PetTable({
  pets,
  emptyMessage,
  onView,
  onEdit,
  onDelete,
}) {
  return (
    <Card bodyClassName="p-0">
      {pets.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-line bg-sage-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className={thClass}>Pet ID</th>
                <th className={thClass}>Pet Name</th>
                <th className={thClass}>Owner</th>
                <th className={thClass}>Species</th>
                <th className={thClass}>Breed</th>
                <th className={thClass}>Age</th>
                <th className={thClass}>Sex</th>
                <th className={`${thClass} text-right`}>Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {pets.map((pet) => (
                <tr key={pet.id} className="hover:bg-sage-50/60">
                  <td className={`${tdClass} font-medium`}>{pet.id}</td>
                  <td className={`${tdClass} font-medium`}>{pet.name}</td>
                  <td className={tdClass}>
                    <span className="font-medium">{pet.ownerName}</span>
                    {pet.ownerContact && (
                      <span className="block text-xs text-muted">
                        {pet.ownerContact}
                      </span>
                    )}
                  </td>
                  <td className={tdClass}>{pet.species}</td>
                  <td className={tdClass}>{pet.breed}</td>
                  <td className={tdClass}>{formatAge(pet.birthDate)}</td>
                  <td className={tdClass}>{pet.sex}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        label={`View ${pet.id}`}
                        onClick={() => onView(pet)}
                      >
                        <Eye size={18} />
                      </IconButton>
                      <IconButton
                        label={`Edit ${pet.id}`}
                        onClick={() => onEdit(pet)}
                      >
                        <Pencil size={18} />
                      </IconButton>
                      <IconButton
                        label={`Delete ${pet.id}`}
                        danger
                        onClick={() => onDelete(pet)}
                      >
                        <Trash2 size={18} />
                      </IconButton>
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
