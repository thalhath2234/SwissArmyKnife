import fs from "fs";
import path from "path";

const root = process.cwd();
const wasmSrc = path.join(root, "node_modules", "pdfjs-dist", "wasm");
const wasmDest = path.join(root, "public", "pdfjs-wasm");
const workerSrc = path.join(
  root,
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.min.mjs",
);
const workerDest = path.join(root, "public", "pdf.worker.min.mjs");

fs.mkdirSync(wasmDest, { recursive: true });
for (const name of fs.readdirSync(wasmSrc)) {
  fs.copyFileSync(path.join(wasmSrc, name), path.join(wasmDest, name));
}
fs.copyFileSync(workerSrc, workerDest);
console.log("Copied pdf.js worker + wasm assets to public/");
