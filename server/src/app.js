// The Express application: middleware first, then the routes, then the error handlers.
// (server.js starts it. Keeping them separate makes the app easy to test later.)
import express from "express";
import cors from "cors";
import { config } from "./config/env.js";
import routes from "./routes/index.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const app = express();

// Only the Vite frontend (see CLIENT_ORIGIN in .env) may call this API from a browser.
app.use(cors({ origin: config.clientOrigins }));

// Lets the server read JSON sent in request bodies.
app.use(express.json());

// Every API route starts with /api.
app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

export default app;
