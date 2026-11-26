// Starts the server. Run it with "npm run dev" (restarts on changes) or "npm start".
import app from "./app.js";
import { config } from "./config/env.js";
import { getHealth } from "./business/services/healthService.js";

const server = app.listen(config.port, async () => {
  console.log(`PetCare server running at http://localhost:${config.port}`);

  // Check the database once at startup so problems show up immediately.
  const health = await getHealth();
  if (health.ok) {
    const db = health.body.database;
    console.log(
      `Database connected: ${db.name} (MySQL ${db.version}, time zone ${db.timeZone})`,
    );
  } else {
    console.log(`Database NOT connected: ${health.body.database.message}`);
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${config.port} is already in use. Close the other program or change PORT in server/.env.`,
    );
  } else {
    console.error("Could not start the server:", error.message);
  }
  process.exit(1);
});
