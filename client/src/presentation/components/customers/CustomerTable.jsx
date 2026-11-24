import { Eye, Pencil, Trash2 } from "lucide-react";
import Card from "../ui/Card.jsx";
import IconButton from "../ui/IconButton.jsx";
import { formatShortDate } from "../../../business/utils/format.js";

// Shared classes so every header cell and every body cell look the same.
const thClass = "whitespace-nowrap px-4 py-3 font-semibold";
const tdClass = "whitespace-nowrap px-4 py-3";

// The customers table. On small screens it keeps a minimum width and the card scrolls sideways,
// so the columns never get squeezed too narrow to read.
export default function CustomerTable({
  customers,
  emptyMessage,
  onView,
  onEdit,
  onDelete,
}) {
  return (
    <Card bodyClassName="p-0">
      {customers.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-line bg-sage-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className={thClass}>Customer ID</th>
                <th className={thClass}>Customer Name</th>
                <th className={thClass}>Contact Number</th>
                <th className={thClass}>Email</th>
                <th className={thClass}>No. of Pets</th>
                <th className={thClass}>Date Registered</th>
                <th className={`${thClass} text-right`}>Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-sage-50/60">
                  <td className={`${tdClass} font-medium`}>{customer.id}</td>
                  <td className={`${tdClass} font-medium`}>
                    {customer.fullName}
                  </td>
                  <td className={tdClass}>{customer.contactNumber}</td>
                  <td className={tdClass}>
                    {customer.email || <span className="text-muted">—</span>}
                  </td>
                  <td className={tdClass}>{customer.petCount}</td>
                  <td className={tdClass}>
                    {formatShortDate(customer.dateRegistered)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        label={`View ${customer.id}`}
                        onClick={() => onView(customer)}
                      >
                        <Eye size={18} />
                      </IconButton>
                      <IconButton
                        label={`Edit ${customer.id}`}
                        onClick={() => onEdit(customer)}
                      >
                        <Pencil size={18} />
                      </IconButton>
                      <IconButton
                        label={`Delete ${customer.id}`}
                        danger
                        onClick={() => onDelete(customer)}
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
