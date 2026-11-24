// PetCare function checker.
// Where to put it: in the client folder, next to package.json (the folder that contains src/).
// How to run:      node check-repo-calls.cjs
//
// It checks two things in EVERY file under src/:
//   1. import * as something from "./file.js"   ->  every something.functionName( call must be exported by that file.
//      (this is how the services call the repositories, for example petRepository.getPets())
//   2. import { a, b } from "./file.js"          ->  a and b must be exported by that file.
//      (this is how the pages and components call the services, for example getPetList)
// It also warns if a presentation file imports from the data layer directly (the 3-layer rule).
const fs = require("fs");
const path = require("path");

const src = path.join(process.cwd(), "src");
if (!fs.existsSync(src)) {
  console.log("Run this from the client folder (the one that contains src/).");
  process.exit(2);
}

const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : [path.join(dir, entry.name)],
    );
const files = walk(src).filter((file) => /\.(js|jsx)$/.test(file));

// Names a file exports: "export function x", "export async function x", "export const x".
function exportedNames(code) {
  const names = new Set();
  for (const m of code.matchAll(
    /export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g,
  ))
    names.add(m[1]);
  return names;
}

let problems = 0;
let checked = 0;
const report = (text) => {
  console.log(text);
  problems++;
};

for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  const shortName = path.relative(process.cwd(), file);

  // The 3-layer rule: pages and components must go through the business layer, never straight to data.
  if (
    shortName.includes(path.join("src", "presentation")) &&
    /from\s+"[^"]*\/data\//.test(code)
  ) {
    report(
      `LAYER RULE     ${shortName} imports from the data layer. Use a service in src/business/services instead.`,
    );
  }

  // 1. import * as alias from "./file.js"  ->  check alias.fn( calls
  for (const m of code.matchAll(
    /^import\s+\*\s+as\s+(\w+)\s+from\s+"([^"]+)";/gm,
  )) {
    const [, alias, where] = m;
    if (!where.startsWith(".")) continue;
    const target = path.resolve(path.dirname(file), where);
    if (!fs.existsSync(target)) continue; // a missing file is reported by check-imports.cjs
    const exported = exportedNames(fs.readFileSync(target, "utf8"));
    const used = new Set(
      [...code.matchAll(new RegExp(`\\b${alias}\\.(\\w+)\\(`, "g"))].map(
        (x) => x[1],
      ),
    );
    for (const fn of used) {
      checked++;
      if (!exported.has(fn))
        report(
          `MISSING FUNCTION ${shortName}: ${alias}.${fn}() but ${path.basename(target)} does not export "${fn}"`,
        );
    }
  }

  // 2. import { a, b } from "./file.js"  ->  check a and b are exported
  for (const m of code.matchAll(
    /^import\s+(?:\w+\s*,\s*)?\{([^}]*)\}\s+from\s+"([^"]+)";/gm,
  )) {
    const [, list, where] = m;
    if (!where.startsWith(".")) continue;
    const target = path.resolve(path.dirname(file), where);
    if (!fs.existsSync(target) || !/\.(js|jsx)$/.test(target)) continue;
    const exported = exportedNames(fs.readFileSync(target, "utf8"));
    for (const item of list.split(",")) {
      const name = item.trim().split(/\s+as\s+/)[0];
      if (!name) continue;
      checked++;
      if (!exported.has(name))
        report(
          `MISSING EXPORT ${shortName}: imports "${name}" but ${path.basename(target)} does not export it`,
        );
    }
  }
}

console.log(
  problems
    ? `\n${problems} problem(s) found.`
    : `All good: ${checked} function/export references match (${files.length} files checked).`,
);
process.exit(problems ? 1 : 0);
