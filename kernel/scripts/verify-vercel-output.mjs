import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const output = join(process.cwd(), ".vercel", "output");
const configPath = join(output, "config.json");
const errors = [];

if (!existsSync(configPath)) {
  console.error("No existe .vercel/output/config.json. El build no produjo Vercel Output.");
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch {
  console.error(".vercel/output/config.json no contiene JSON válido.");
  process.exit(1);
}
if (config.version !== 3) errors.push(`Se esperaba Vercel Output v3; versión detectada: ${String(config.version)}.`);
if (!Array.isArray(config.routes)) errors.push("config.json no contiene una matriz routes.");

const functionsRoot = join(output, "functions");
const staticRoot = join(output, "static");
if (!existsSync(functionsRoot)) errors.push("Falta .vercel/output/functions.");
if (!existsSync(staticRoot)) errors.push("Falta .vercel/output/static.");

function walk(path, files = []) {
  if (!existsSync(path)) return files;
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const functionDirs = existsSync(functionsRoot)
  ? readdirSync(functionsRoot).filter((name) => name.endsWith(".func") && statSync(join(functionsRoot, name)).isDirectory())
  : [];
if (!functionDirs.length) errors.push("No se ha generado ninguna Vercel Function (.func). Revisa Nitro/preset.");

const maxFunctionBytes = 240 * 1024 * 1024; // margen por Function frente al límite estándar de 250 MB sin comprimir.
const functionSizes = [];
for (const dir of functionDirs) {
  const files = walk(join(functionsRoot, dir));
  const bytes = files.reduce((sum, file) => sum + statSync(file).size, 0);
  functionSizes.push({ name: dir, bytes, files: files.length });
  if (bytes > maxFunctionBytes) {
    errors.push(`La Function ${dir} ocupa ${(bytes / 1024 / 1024).toFixed(1)} MB sin comprimir; el control preventivo por Function está fijado en 240 MB.`);
  }
}

const staticFiles = walk(staticRoot);
const oversizedStatic = staticFiles.filter((file) => statSync(file).size > 100 * 1024 * 1024);
for (const file of oversizedStatic) errors.push(`Archivo estático superior a 100 MB: ${relative(output, file)}.`);

if (errors.length) {
  console.error("VERCEL OUTPUT: FAILED");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("VERCEL OUTPUT: OK");
console.log(`- Vercel Output v${config.version}`);
console.log(`- Rutas: ${config.routes.length}`);
console.log(`- Functions: ${functionDirs.join(", ")}`);
for (const fn of functionSizes) console.log(`- ${fn.name}: ${(fn.bytes / 1024 / 1024).toFixed(2)} MB (${fn.files} archivos)`);
console.log(`- Archivos estáticos: ${staticFiles.length}`);
