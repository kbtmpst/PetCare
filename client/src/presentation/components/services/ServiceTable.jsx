import { Eye, Pencil, Trash2 } from "lucide-react";
import Card from "../ui/Card.jsx";
import IconButton from "../ui/IconButton.jsx";
import ServiceStatusBadge from "./ServiceStatusBadge.jsx";
import {
  formatCurrency,
  formatDuration,
} from "../../../business/utils/format.js";

// Shared classes so every header cell and every body cell look the same.
const thClass = "whitespace-nowrap px-4 py-3 font-semibold";
const tdClass = "whitespace-nowrap px-4 py-3";

// The services table. On small screens it keeps a minimum width and the card scrolls sideways,
// so the columns never get squeezed too narrow to read.
export default function ServiceTable({
  services,
  emptyMessage,
  onView,
  onEdit,
  onDelete,
}) {
  return (
    <Card bodyClassName="p-0">
      {services.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-line bg-sage-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className={thClass}>ID</th>
                <th className={thClass}>Service Name</th>
                <th className={thClass}>Description</th>
                <th className={thClass}>Price</th>
                <th className={thClass}>Duration</th>
                <th className={thClass}>Status</th>
                <th className={`${thClass} text-right`}>Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {services.map((service) => (
                <tr key={service.id} className="hover:bg-sage-50/60">
                  <td className={`${tdClass} font-medium`}>{service.id}</td>
                  <td className={`${tdClass} font-medium`}>{service.name}</td>
                  {/* A long description is cut with "..." here; the full text is in the View window. */}
                  <td
                    className="max-w-xs truncate px-4 py-3 text-muted"
                    title={service.description}
                  >
                    {service.description || "—"}
                  </td>
                  <td className={tdClass}>{formatCurrency(service.price)}</td>
                  <td className={tdClass}>
                    {formatDuration(service.durationMinutes)}
                  </td>
                  <td className={tdClass}>
                    <ServiceStatusBadge status={service.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        label={`View ${service.name}`}
                        onClick={() => onView(service)}
                      >
                        <Eye size={18} />
                      </IconButton>
                      <IconButton
                        label={`Edit ${service.name}`}
                        onClick={() => onEdit(service)}
                      >
                        <Pencil size={18} />
                      </IconButton>
                      <IconButton
                        label={`Delete ${service.name}`}
                        danger
                        onClick={() => onDelete(service)}
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
