import { MAX_LEVEL } from "#lib/levels";
import { localeOf, t } from "#lib/i18n";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { config } from "#lib/config";

export const PN_SUFFIX = "@s.whatsapp.net";
export const LID_SUFFIX = "@lid";
export const GROUP_SUFFIX = "@g.us";
export const STATUS_JID = "status@broadcast";

export const isLid = (jid) => typeof jid === "string" && jid.endsWith(LID_SUFFIX);
export const isPn = (jid) => typeof jid === "string" && jid.endsWith(PN_SUFFIX);
export const isGroupJid = (jid) => typeof jid === "string" && jid.endsWith(GROUP_SUFFIX);
export const bare = (jid) => (typeof jid === "string" ? jid.replace(/:\d+(?=@)/, "") : jid);
export const numberOf = (jid) => (bare(jid) ?? "").split("@")[0];
export const toPn = (number) => `${String(number).replace(/\D/g, "")}${PN_SUFFIX}`;

export const extractMentions = (text = "") =>
  [...String(text).matchAll(/@(\d{6,16})\b/g)].map((m) => toPn(m[1]));

export async function resolveIdentity(sock, ...candidates) {
  let pn = null;
  let lid = null;

  for (const candidate of candidates) {
    const jid = bare(candidate);
    if (isLid(jid)) lid ??= jid;
    else if (isPn(jid)) pn ??= jid;
  }

  if (lid && !pn) {
    try {
      const mapped = await sock.signalRepository?.lidMapping?.getPNForLID?.(lid);
      if (mapped) pn = bare(mapped);
    } catch {}
  }

  return { pn, lid, id: pn ?? lid ?? null };
}

export const dayKey = (timeZone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const clockTime = (timeZone) =>
  new Intl.DateTimeFormat(localeOf(), { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date())
    .replace(".", ":");

export const greeting = (timeZone) => {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date()),
  );
  if (hour >= 4 && hour < 11) return t("greet.morning");
  if (hour >= 11 && hour < 15) return t("greet.noon");
  if (hour >= 15 && hour < 18) return t("greet.evening");
  return t("greet.night");
};

export const uptime = (seconds) => {
  const s = Math.floor(seconds);
  const parts = [
    [Math.floor(s / 86400), t("up.d")],
    [Math.floor((s % 86400) / 3600), t("up.h")],
    [Math.floor((s % 3600) / 60), t("up.m")],
    [s % 60, t("up.s")],
  ].filter(([value]) => value > 0);
  return (parts.length ? parts : [[0, t("up.s")]]).map(([value, unit]) => `${value}${unit}`).join(" ");
};

export const duration = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return t("dur.sec", { s });
  if (s < 3600) return t("dur.minSec", { m: Math.floor(s / 60), s: s % 60 });
  if (s < 86400) return t("dur.hourMin", { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) });
  return t("dur.dayHour", { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600) });
};

export const toNumber = (value) =>
  typeof value === "number" ? value : typeof value?.toNumber === "function" ? value.toNumber() : Number(value) || 0;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SMALL_CAPS = {
  a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ғ", g: "ɢ", h: "ʜ", i: "ɪ",
  j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ", q: "ǫ", r: "ʀ",
  s: "s", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ",
};

export const smallCaps = (text) => [...String(text).toLowerCase()].map((c) => SMALL_CAPS[c] ?? c).join("");
export const slugify = (text) => String(text).toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}_]/gu, "");
export const formatNumber = (n) => Number(n).toLocaleString("id-ID");
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const truncate = (text, max = 3000) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const progressBar = (value, max, length = 10) => {
  const filled = Math.min(length, Math.floor((Math.min(value, max) / Math.max(max, 1)) * length));
  return "█".repeat(filled) + "░".repeat(length - filled);
};

const bigrams = (s) => {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i++) out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) ?? 0) + 1);
  return out;
};

export const similarity = (a, b) => {
  a = String(a).toLowerCase();
  b = String(b).toLowerCase();
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const B = bigrams(b);
  let overlap = 0;
  for (const [gram, count] of bigrams(a)) overlap += Math.min(count, B.get(gram) ?? 0);
  return (2 * overlap) / (a.length + b.length - 2);
};

export const closest = (word, candidates, threshold = 0.4) => {
  let best = null;
  let score = 0;
  for (const candidate of candidates) {
    const s = similarity(word, candidate);
    if (s > score) [best, score] = [candidate, s];
  }
  return score >= threshold ? best : null;
};

export const expNeeded = (level) => 100 + level * 50;

// Tambah EXP; mengembalikan berapa level yang naik (0 jika tidak naik).
export const gainExp = (user, amount) => {
  user.level ??= 1;
  if (user.level >= MAX_LEVEL) { user.level = MAX_LEVEL; user.exp = 0; return 0; } // sudah level maksimum (config/levels.json)
  user.exp = (user.exp ?? 0) + amount;
  let gained = 0;
  while (user.level < MAX_LEVEL && user.exp >= expNeeded(user.level)) {
    user.exp -= expNeeded(user.level);
    user.level += 1;
    gained++;
  }
  if (user.level >= MAX_LEVEL) user.exp = 0;
  return gained;
};

export class Cache {
  #map = new Map();
  #max;
  #ttl;

  constructor({ max = 500, ttl = 0 } = {}) {
    this.#max = max;
    this.#ttl = ttl;
  }

  get(key) {
    const hit = this.#map.get(key);
    if (!hit) return undefined;
    if (hit.expires && hit.expires < Date.now()) {
      this.#map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value) {
    this.#map.delete(key);
    this.#map.set(key, { value, expires: this.#ttl ? Date.now() + this.#ttl : 0 });
    if (this.#map.size > this.#max) this.#map.delete(this.#map.keys().next().value);
    return value;
  }

  delete(key) {
    return this.#map.delete(key);
  }
}

export const messageCache = new Cache({ max: 1000 });

export const MEDIA_KINDS = {
  imageMessage: "image",
  videoMessage: "video",
  ptvMessage: "video",
  audioMessage: "audio",
  stickerMessage: "sticker",
  documentMessage: "document",
};

const at = (buf, offset, bytes) => bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf, from, to) => buf.subarray(from, to).toString("latin1");

export const sniff = (buf) => {
  if (at(buf, 0, [0xff, 0xd8, 0xff])) return { type: "image", mime: "image/jpeg", ext: "jpg" };
  if (at(buf, 0, [0x89, 0x50, 0x4e, 0x47])) return { type: "image", mime: "image/png", ext: "png" };
  if (ascii(buf, 0, 4) === "GIF8") return { type: "image", mime: "image/gif", ext: "gif" };
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return { type: "sticker", mime: "image/webp", ext: "webp" };
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WAVE") return { type: "audio", mime: "audio/wav", ext: "wav" };
  if (ascii(buf, 4, 8) === "ftyp") {
    return ascii(buf, 8, 12).startsWith("M4A")
      ? { type: "audio", mime: "audio/mp4", ext: "m4a" }
      : { type: "video", mime: "video/mp4", ext: "mp4" };
  }
  if (at(buf, 0, [0x1a, 0x45, 0xdf, 0xa3])) return { type: "video", mime: "video/webm", ext: "webm" };
  if (ascii(buf, 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { type: "audio", mime: "audio/mpeg", ext: "mp3" };
  if (ascii(buf, 0, 4) === "OggS") return { type: "audio", mime: "audio/ogg", ext: "ogg" };
  if (ascii(buf, 0, 4) === "%PDF") return { type: "document", mime: "application/pdf", ext: "pdf" };
  if (at(buf, 0, [0x50, 0x4b, 0x03, 0x04])) return { type: "document", mime: "application/zip", ext: "zip" };
  return { type: "document", mime: "application/octet-stream", ext: "bin" };
};

export const request = async (url, { timeout = 15_000, ...init } = {}) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  return res;
};

export const getBuffer = async (url, opts) => Buffer.from(await (await request(url, opts)).arrayBuffer());
export const getJson = async (url, opts) => (await request(url, opts)).json();

let thumbnail;
export const getThumbnail = () => {
  if (thumbnail === undefined) {
    const file = path.join(config.paths.config, "thumbnail.jpg");
    thumbnail = existsSync(file) ? readFileSync(file) : null;
  }
  return thumbnail ?? undefined;
};

/*
 * Thumbnail hasil re-encode dari sebuah gambar (via ffmpeg): baseline JPEG, lebar `width`.
 * WhatsApp sering menolak JPEG progressive / terlalu besar untuk thumbnail inline.
 * Di-cache per file + lebar. Kalau ffmpeg gagal, pakai file aslinya.
 */
const thumbCache = new Map();
const thumbFromFile = (file, width) => {
  const key = `${file}:${width}`;
  if (thumbCache.has(key)) return thumbCache.get(key);

  let original;
  try {
    original = readFileSync(file);
  } catch {
    return undefined;
  }

  let out;
  try {
    out = execFileSync(
      "ffmpeg",
      [
        "-v", "error",
        "-i", file,
        "-vf", `scale='min(${width},iw)':-2`,
        "-q:v", "5",
        "-pix_fmt", "yuvj420p",
        "-strict", "unofficial",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "pipe:1",
      ],
      { maxBuffer: 5 * 1024 * 1024, timeout: 10_000 },
    );
  } catch {
    out = original;
  }
  thumbCache.set(key, out);
  return out;
};

// Thumbnail dari buffer gambar (mis. foto profil). Gagal → buffer asli.
export const bufferThumbnail = (buffer, width = 300) => {
  try {
    return execFileSync(
      "ffmpeg",
      ["-v", "error", "-i", "pipe:0", "-vf", `scale='min(${width},iw)':-2`, "-q:v", "5", "-pix_fmt", "yuvj420p", "-strict", "unofficial", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"],
      { input: buffer, maxBuffer: 5 * 1024 * 1024, timeout: 10_000 },
    );
  } catch {
    return buffer;
  }
};

export const getPreviewThumbnail = (width = 480) =>
  existsSync(path.join(config.paths.config, "thumbnail.jpg"))
    ? thumbFromFile(path.join(config.paths.config, "thumbnail.jpg"), width)
    : undefined;

/*
 * Gambar acak dari config/reply/ untuk kartu pratinjau (gambar kecil di kiri).
 * Tambah/hapus gambar (jpg, png, webp) di folder itu kapan saja — dibaca ulang tiap kirim.
 * Folder kosong → pakai config/thumbnail.jpg.
 */
const REPLY_IMAGE = /\.(jpe?g|png|webp)$/i;
export const replyImages = () => {
  const dir = path.join(config.paths.config, "reply");
  try {
    return readdirSync(dir).filter((f) => REPLY_IMAGE.test(f)).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
};

export const randomReplyThumbnail = (width = 300) => {
  const files = replyImages();
  return (files.length ? thumbFromFile(pick(files), width) : undefined) ?? getPreviewThumbnail(width);
};

// Ukuran (px) JPEG dari header SOF — tanpa dependensi.
export const jpegSize = (buf) => {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
};

const quotedBase = () => ({
  key: {
    remoteJid: STATUS_JID,
    participant: "0@s.whatsapp.net",
    fromMe: false,
    id: `MIYAKO${Date.now().toString(36).toUpperCase()}`,
  },
});

export const fakeQuoted = {
  contact: (name = config.name) => {
    const owner = [...config.owners][0] ?? "0";
    return {
      ...quotedBase(),
      message: {
        contactMessage: {
          displayName: name,
          vcard: ["BEGIN:VCARD", "VERSION:3.0", `N:;${name};;;`, `FN:${name}`, `item1.TEL;waid=${owner}:+${owner}`, "item1.X-ABLabel:Owner", "END:VCARD"].join("\n"),
        },
      },
    };
  },
  // Kutipan dengan foto di kanan (jpegThumbnail) — dipakai untuk menampilkan foto profil pengirim perintah.
  avatar: (name = config.name, thumbnail) => ({
    ...quotedBase(),
    message: { imageMessage: { mimetype: "image/jpeg", caption: name, jpegThumbnail: thumbnail, width: 160, height: 160 } },
  }),
  text: (text = config.name) => ({ ...quotedBase(), message: { conversation: text } }),
};
