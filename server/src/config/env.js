// CONFIG: reads the settings from the server/.env file and checks them.
// Every other file imports "config" from here instead of reading process.env directly,
// so all settings live in one place.
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Load server/.env no matter which folder the command is started from.
dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

// A setting that must exist. If it is missing, stop with a clear message.
function required(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing ${name}. Open server/.env (copy .env.example if you do not have it) and set ${name}.`,
    );
  }
  return value.trim();
}

const timezone = (process.env.DB_TIMEZONE || "+08:00").trim();
if (!/^[+-]\d{2}:\d{2}$/.test(timezone)) {
  throw new Error('DB_TIMEZONE must look like "+08:00".');
}

export const config = {
  port: Number(process.env.PORT) || 5000,

  // Websites that are allowed to call this API (the Vite dev server). Separate several with commas.
  clientOrigins: (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: required("DB_USER"),
    password: process.env.DB_PASSWORD ?? "",
    database: required("DB_NAME"),
    timezone,
  },
};
