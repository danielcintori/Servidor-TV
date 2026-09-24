import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = path.resolve(process.env.DATA_DIR || path.join(root, "data"));
const uploads = path.resolve(
  process.env.UPLOAD_DIR || path.join(root, "uploads"),
);
const target = process.argv[2];
if (!target)
  throw new Error(
    "Uso: node scripts/backup.js /caminho/backup-novo (pare o serviço antes)",
  );
const destination = path.resolve(target);
for (const source of [data, uploads]) {
  const relative = path.relative(source, destination);
  if (
    !relative ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
    throw new Error("O backup deve ficar fora das pastas de origem.");
}
if (fs.existsSync(destination))
  throw new Error("Use uma pasta nova para não sobrescrever um backup.");
fs.mkdirSync(destination, { recursive: true });
for (const [name, source] of [
  ["data", data],
  ["uploads", uploads],
])
  if (fs.existsSync(source))
    fs.cpSync(source, path.join(destination, name), { recursive: true });
console.log(
  `Backup criado em ${destination}. Copie-o para armazenamento independente.`,
);
