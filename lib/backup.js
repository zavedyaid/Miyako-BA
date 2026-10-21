import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { config } from "#lib/config";
import { db } from "#lib/database";
import { logger } from "#lib/logger";

/*
 * Backup database (manual lewat .backup, otomatis berkala).
 *   Isi zip   : database/*.json, config/config.json, config/levels.json
 *   "full"    : seluruh proyek (kode, config, database, session/) tanpa node_modules, .npm, .git, backups, tmp
 *   Lokasi    : backups/   (berkas "backup-<waktu>[-auto|-pre-restore][-full].zip")
 *   Otomatis  : config.json → backup { auto, everyHours, keep, sendToOwner }  — bisa diubah lewat .backup auto on|off [jam]
 * ZIP ditulis/dibaca sendiri (zlib bawaan Node) — tanpa dependensi tambahan.
 */
const root = config.paths.root;
export const BACKUP_DIR = path.join(root, "backups");
const SETTINGS_FILES = ["config/config.json", "config/levels.json"];

/* ── ZIP minimal ─────────────────────────────────────────────────────────── */
const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const dos = (date) => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  day: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

// entries: [{ name: "database/users.json", data: Buffer }]
export const zipBuild = (entries) => {
  const { time, day } = dos(new Date());
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8"), packed = zlib.deflateRawSync(data), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(day, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12); central.writeUInt16LE(day, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, packed);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
};

export const zipRead = (buf) => {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("Not a valid ZIP file.");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("ZIP directory is corrupted.");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    out.push({ name, data: method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw) });
    p += 46 + nlen + xlen + clen;
  }
  return out;
};

/* ── membuat / mendaftar / memulihkan ───────────────────────────────────── */
const stamp = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`;
};

const walk = (dir, base = dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(root, path.join(dir, e.name)).replaceAll("\\", "/")]))
    : [];

// Backup "full" = seluruh proyek (kode, config, database, sesi) KECUALI folder yang bisa dibuat ulang / tidak perlu.
const EXCLUDE = new Set(["node_modules", ".npm", ".git", "backups", "tmp", ".cache", "__pycache__"]);
const skipFile = (name) => name.endsWith(".log") || name === ".DS_Store";
const walkProject = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return EXCLUDE.has(e.name) ? [] : walkProject(path.join(dir, e.name));
    return skipFile(e.name) ? [] : [path.relative(root, path.join(dir, e.name)).replaceAll("\\", "/")];
  });

export const createBackup = ({ kind = "manual", full = false } = {}) => {
  db.flush();
  const files = full ? walkProject(root) : [...walk(config.paths.database).filter((f) => f.endsWith(".json")), ...SETTINGS_FILES.filter((f) => fs.existsSync(path.join(root, f)))];
  const entries = files.map((name) => ({ name, data: fs.readFileSync(path.join(root, name)) }));
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `backup-${stamp()}${kind === "manual" ? "" : `-${kind}`}${full ? "-full" : ""}.zip`;
  const file = path.join(BACKUP_DIR, name);
  const buffer = zipBuild(entries);
  fs.writeFileSync(file, buffer);
  if (kind === "auto") prune();
  return { name, file, size: buffer.length, files: files.length };
};

export const listBackups = () =>
  fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR).filter((f) => /^backup-.*\.zip$/.test(f)).map((name) => { const st = fs.statSync(path.join(BACKUP_DIR, name)); return { name, size: st.size, at: st.mtimeMs }; }).sort((a, b) => b.at - a.at)
    : [];

export const findBackup = (query) => {
  const all = listBackups();
  if (!query || query === "latest") return all.find((x) => !x.name.includes("-pre-restore")) ?? all[0] ?? null; // "latest" melewati cadangan pengaman
  const n = Number(query);
  if (Number.isInteger(n) && n >= 1 && n <= all.length) return all[n - 1];
  return all.find((b) => b.name === query || b.name === `${query}.zip` || b.name.includes(query)) ?? null;
};

const keepCount = () => Math.max(1, Number(db.settings.backup?.keep ?? config.backup?.keep ?? 10));
const prune = () => {
  const autos = listBackups().filter((b) => b.name.includes("-auto"));
  for (const old of autos.slice(keepCount())) fs.rmSync(path.join(BACKUP_DIR, old.name), { force: true });
};

// Pulihkan dari buffer zip. Selalu membuat cadangan "pre-restore" dulu. Hanya jalur yang diizinkan yang ditulis.
export const restoreBackup = (buffer) => {
  const entries = zipRead(buffer);
  const allowed = (n) => !n.includes("..") && !path.isAbsolute(n) && (/^database\/[\w.-]+\.json$/.test(n) || SETTINGS_FILES.includes(n) || n.startsWith("session/"));
  const usable = entries.filter((e) => allowed(e.name) && !e.name.endsWith("/"));
  if (!usable.some((e) => e.name.startsWith("database/"))) throw new Error("This ZIP has no database files.");
  const safety = createBackup({ kind: "pre-restore" });
  for (const { name, data } of usable) {
    if (name.endsWith(".json")) JSON.parse(data.toString("utf8")); // tolak berkas rusak sebelum menimpa apa pun
  }
  for (const { name, data } of usable) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  db.load();
  return { restored: usable.length, safety: safety.name, needsRestart: usable.some((e) => e.name.startsWith("session/") || e.name.startsWith("config/")) };
};

/* ── otomatis ───────────────────────────────────────────────────────────── */
let timer = null;
let lastSock = null;

export const backupSettings = () => {
  const s = db.settings.backup ?? {};
  return {
    auto: s.auto ?? config.backup?.auto ?? true,
    hours: Number(s.hours ?? config.backup?.everyHours ?? 6),
    sendToOwner: s.sendToOwner ?? config.backup?.sendToOwner ?? true,
  };
};

const ownerJid = () => {
  const n = [...config.owners][0];
  return n ? `${n}@s.whatsapp.net` : null;
};

const tick = async () => {
  const { auto, sendToOwner } = backupSettings();
  if (!auto) return;
  try {
    const result = createBackup({ kind: "auto" });
    logger.ok(`Auto backup: ${result.name} (${(result.size / 1024).toFixed(1)} KB, ${result.files} files)`);
    const jid = ownerJid();
    if (sendToOwner && jid && lastSock) {
      await lastSock.sendMessage(jid, { document: fs.readFileSync(result.file), mimetype: "application/zip", fileName: result.name, caption: `💾 Auto backup — ${result.name}` });
    }
  } catch (err) {
    logger.warn(`Auto backup failed: ${err.message}`);
  }
};

// Dipanggil setiap koneksi "open" (aman dipanggil berulang). Mulai jadwal baru; backup pertama bila yang terakhir sudah lewat interval.
export const startAutoBackup = (sock) => {
  lastSock = sock;
  clearInterval(timer);
  timer = null;
  const { auto, hours } = backupSettings();
  if (!auto) return;
  const ms = Math.max(0.1, hours) * 3_600_000;
  timer = setInterval(tick, ms);
  timer.unref?.();
  const latest = listBackups()[0];
  if (!latest || Date.now() - latest.at > ms) setTimeout(tick, 15_000).unref?.();
};
export const refreshAutoBackup = () => startAutoBackup(lastSock);
