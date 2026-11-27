// Tests that the Appointments routes are REGISTERED in routes/index.js, and registered correctly.
//
// Part 1 reads routes/index.js as TEXT. It needs no Express and no MySQL, so it always runs.
// Part 2 loads the real routes/index.js and looks inside the real Express router. It needs express and mysql2
// (and server/.env), so it is SKIPPED where they cannot load (for example in Claude's sandbox).
// Neither part starts a server or sends a request. Real requests are the E3 checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexSource = readFileSync(
  new URL("../src/routes/index.js", import.meta.url),
  "utf8",
);
const codeLines = indexSource
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => !line.startsWith("//"));

// ---------------------------------------------------------------------------
// Part 1: the text of routes/index.js (always runs)
// ---------------------------------------------------------------------------

test("routes/index.js imports the appointment routes exactly once", () => {
  const imports = codeLines.filter(
    (line) => line.startsWith("import ") && line.includes("appointmentRoutes"),
  );
  assert.deepEqual(imports, [
    'import appointmentRoutes from "./appointmentRoutes.js";',
  ]);
});

test("routes/index.js mounts the appointment routes at /appointments exactly once", () => {
  const mounts = codeLines.filter(
    (line) =>
      line.startsWith("router.use(") && line.includes("appointmentRoutes"),
  );
  assert.deepEqual(mounts, ['router.use("/appointments", appointmentRoutes);']);
});

test("the appointment routes are mounted on the same router, in the same style, as the existing groups", () => {
  const mounts = codeLines.filter((line) => line.startsWith("router.use("));
  assert.deepEqual(mounts, [
    'router.use("/health", healthRoutes);',
    'router.use("/services", serviceRoutes);',
    'router.use("/customers", customerRoutes);',
    'router.use("/pets", petRoutes);',
    'router.use("/appointments", appointmentRoutes);',
    'router.use("/auth", authRoutes);',
  ]);
});

test("the earlier route groups are still mounted (nothing was removed or renamed)", () => {
  for (const name of [
    "healthRoutes",
    "serviceRoutes",
    "customerRoutes",
    "petRoutes",
    "authRoutes",
  ]) {
    assert.ok(
      codeLines.some(
        (line) => line.startsWith("router.use(") && line.includes(name),
      ),
      name,
    );
    assert.ok(
      codeLines.some(
        (line) => line.startsWith("import ") && line.includes(name),
      ),
      name,
    );
  }
});

// ---------------------------------------------------------------------------
// Part 2: the real Express router (skipped when express or mysql2 cannot load)
// ---------------------------------------------------------------------------

let loaded = null;
try {
  const routes = (await import("../src/routes/index.js")).default;
  const appointmentRoutes = (await import("../src/routes/appointmentRoutes.js"))
    .default;
  loaded = { routes, appointmentRoutes };
} catch {
  loaded = null; // express, mysql2 or the environment settings are not available in this environment
}
const skip =
  loaded === null
    ? "express / mysql2 / server/.env cannot be loaded here"
    : false;

test(
  "the real /api router contains the real appointment router",
  { skip },
  () => {
    const layers = loaded.routes.stack.filter(
      (layer) => layer.handle === loaded.appointmentRoutes,
    );
    assert.equal(layers.length, 1);
  },
);

test(
  "the appointment router starts with the login check and has the 5 appointment endpoints",
  { skip },
  () => {
    const stack = loaded.appointmentRoutes.stack;
    assert.equal(
      stack[0].route,
      undefined,
      "the first layer is router.use(authenticate), not an endpoint",
    );
    const endpoints = stack
      .filter((layer) => layer.route)
      .map((layer) => {
        const methods = Object.keys(layer.route.methods).filter(
          (method) => layer.route.methods[method],
        );
        return `${methods.join(",").toUpperCase()} ${layer.route.path}`;
      });
    assert.deepEqual(endpoints, [
      "GET /",
      "GET /:id",
      "POST /",
      "PUT /:id",
      "PATCH /:id/status",
    ]);
  },
);
