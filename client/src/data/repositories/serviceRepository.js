// DATA LAYER: where grooming services come from (sample data for now, the Express API later).
// The Services page will add create / update functions here when it is built.
import { services } from "../mock/sampleData.js";

export async function getServices() {
  return services.map((service) => ({ ...service }));
}

export async function getServiceById(id) {
  const service = services.find((item) => item.id === id);
  return service ? { ...service } : null;
}
