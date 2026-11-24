// DATA LAYER: the only place that knows where grooming services are stored.
//
// For now the services live in a JavaScript array in memory, so add / edit / delete work while the app is
// open. Refreshing the browser resets them to the sample data. Later each function becomes a fetch() call
// to the Express API (for example fetch("/api/services")); the business layer will not notice.
//
// Unlike customers ("CUS-001") and pets ("PET-001"), services use plain numbers as ids (1, 2, 3 ...),
// because the appointments already store them that way in appointment.serviceId.
import { services as sampleServices } from "../mock/sampleData.js";

// A copy of the sample data, so editing here never changes the original sample file.
let services = sampleServices.map((service) => ({ ...service }));

// The next id is always one higher than the highest id ever used. The counter only goes up,
// so the id of a deleted service is never given to a new one.
let lastId = services.reduce(
  (highest, service) => Math.max(highest, service.id),
  0,
);

// READ: all services (copies, so other code cannot change our stored data by accident).
export async function getServices() {
  return services.map((service) => ({ ...service }));
}

// READ: one service, or null if there is no service with that id.
export async function getServiceById(id) {
  const service = services.find((item) => item.id === id);
  return service ? { ...service } : null;
}

// CREATE: save a new service and return it (with its new id).
export async function createService(data) {
  lastId += 1;
  const newService = { ...data, id: lastId };
  services = [...services, newService];
  return { ...newService };
}

// UPDATE: change some fields of one service. Returns the updated service, or null if not found.
export async function updateService(id, changes) {
  const existing = services.find((service) => service.id === id);
  if (!existing) return null;

  const updated = { ...existing, ...changes, id }; // the id can never change
  services = services.map((service) => (service.id === id ? updated : service));
  return { ...updated };
}

// DELETE: remove one service. Returns true if something was deleted.
// (The business layer decides WHETHER a service may be deleted. This function just does it.)
export async function deleteService(id) {
  const exists = services.some((service) => service.id === id);
  services = services.filter((service) => service.id !== id);
  return exists;
}
