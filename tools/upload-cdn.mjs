// Unggah semua aset config (kartu, RPG, catur, thumbnail) ke https://cdn.zavedya.id → config/cdn-manifest.json
// Pakai: node tools/upload-cdn.mjs            (semua)
//        node tools/upload-cdn.mjs cards rpg  (hanya folder tertentu: cards, cards/rpg, chess, games, reply)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "config");
const OUT = path.join(ROOT, "cdn-manifest.json");
const ENDPOINT = "https://cdn.zavedya.id/upload";
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ttf": "font/ttf", ".json": "application/json", ".html": "text/html" };
const SKIP_EXT = new Set([".txt"]);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const findUrl = (v, d = 0) => {
  if (d > 4 || v == null) return null;
  if (typeof v === "string") return /^https?:\/\//.test(v) ? v : v.startsWith("/") ? new URL(ENDPOINT).origin + v : null;
  if (typeof v === "object") for (const k of ["url", "link", "fileUrl", "file_url", "href", "path", "file", "data", "result", ...Object.keys(v)]) { const f = findUrl(v[k], d + 1); if (f) return f; }
  return null;
};

const filters = process.argv.slice(2);
const manifest = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const files = walk(ROOT).filter((f) => !SKIP_EXT.has(path.extname(f)) && path.basename(f) !== "cdn-manifest.json" && !/(config|levels)\.json$|\/lang\//.test(f.replaceAll("\\", "/")));
let ok = 0, fail = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file).replaceAll("\\", "/");
  if (filters.length && !filters.some((f) => rel.startsWith(f))) continue;
  if (manifest[rel]) { console.log(`= ${rel} (sudah ada)`); continue; }
  try {
    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(file)], { type: MIME[path.extname(file)] ?? "application/octet-stream" }), path.basename(file));
    const res = await fetch(ENDPOINT, { method: "POST", body: form, signal: AbortSignal.timeout(120_000) });
    const url = findUrl(await res.json());
    if (!res.ok || !url) throw new Error(`HTTP ${res.status}`);
    manifest[rel] = url; ok++;
    console.log(`✓ ${rel} → ${url}`);
    fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
  } catch (err) { fail++; console.log(`✗ ${rel}: ${err.message}`); }
}
console.log(`\nSelesai: ${ok} terunggah, ${fail} gagal → ${path.relative(process.cwd(), OUT)}`);
