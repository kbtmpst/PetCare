// DATA LAYER: revenue and service-popularity figures used by the dashboard and analytics.
// Today these are sample numbers. Later they will come from the Express API (MySQL queries).
import { monthlyRevenue, popularServices } from "../mock/sampleData.js";

export async function getMonthlyRevenue() {
  return monthlyRevenue;
}

export async function getPopularServices() {
  return popularServices;
}
