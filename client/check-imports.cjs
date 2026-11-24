// PetCare import checker. Run it from the client folder (the one that contains src/):
//   node check-imports.cjs
// It reports every relative import whose file does not exist (or has the wrong letter case),
// and every named/default import that the target file does not export.
const fs = require("fs");
const path = require("path");

const src = path.join(process.cwd(), "src");
if (!fs.existsSync(src)) {
  console.log("Run this from the client folder (the one that contains src/).");
  process.exit(2);
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
  );
const files = walk(src).filter((file) => /\.(js|jsx)$/.test(file));

// Does the file exist with exactly this spelling (capital letters included)?
function existsExact(filePath) {
  const dir = path.dirname(filePath);
  return fs.existsSync(dir) && fs.readdirSync(dir).includes(path.basename(filePath));
}

let problems = 0;
for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  const shortName = path.relative(process.cwd(), file);

  // One import statement: import <what> from "<where>";   ([^;"] keeps it from running into the next line)
  for (const match of code.matchAll(/^import\s+([^;"]*?)\s+from\s+"([^"]+)";/gm)) {
    const what = match[1];
    const where = match[2];
    if (!where.startsWith(".")) continue; // packages like "react" are not checked here

    const target = path.resolve(path.dirname(file), where);
    if (!existsExact(target)) {
      console.log(`MISSING FILE   ${shortName}\n   imports "${where}"\n   but there is no file at ${path.relative(process.cwd(), target)}`);
      problems++;
      continue;
    }
    if (!/\.(js|jsx)$/.test(target)) continue;

    const targetCode = fs.readFileSync(target, "utf8");
    const hasExport = (name) =>
      new RegExp(`export\\s+(async\\s+)?(function|const|let|class)\\s+${name}\\b`).test(targetCode);

    const named = what.match(/\{([^}]*)\}/);
    if (named) {
      for (const item of named[1].split(",")) {
        const name = item.trim().split(/\s+as\s+/)[0];
        if (name && !hasExport(name)) {
          console.log(`MISSING EXPORT ${shortName}: "${name}" is not exported by ${where}`);
          problems++;
        }
      }
    }
    const defaultImport = what.replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+\w+/, "").replace(/,/g, "").trim();
    if (defaultImport && !/export\s+default\b/.test(targetCode)) {
      console.log(`MISSING EXPORT ${shortName}: ${where} has no default export`);
      problems++;
    }
  }
}

console.log(problems ? `\n${problems} problem(s) found.` : `All relative imports resolve (${files.length} files checked).`);
process.exit(problems ? 1 : 0);
