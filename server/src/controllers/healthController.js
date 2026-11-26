// CONTROLLER: receives the request, asks the business layer, and sends the response.
// Controllers contain no rules and no SQL. 200 = healthy, 503 = the database is unavailable.
import { getHealth } from "../business/services/healthService.js";

export async function checkHealth(req, res) {
  const result = await getHealth();
  res.status(result.ok ? 200 : 503).json(result.body);
}
