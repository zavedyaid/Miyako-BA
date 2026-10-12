/*
 * Pembantu membaca respons API di plugin (bukan bagian api.js — api.js hanya menyambung).
 * Dibuat toleran karena bentuk respons tiap endpoint bisa berbeda.
 */
const URL_RE = /^https?:\/\/\S+$/i;
const DATA_RE = /^data:([\w.+-]+)\/([\w.+-]+);base64,/i;
const LIST_KEYS = ["results", "result", "data", "items", "list", "pins", "images", "videos", "articles", "news"];

export const isUrl = (v) => typeof v === "string" && URL_RE.test(v);

// ── Teks ────────────────────────────────────────────────────────────────────
export const pickText = (data, depth = 0) => {
  if (typeof data === "string") return data.trim() || null;
  if (!data || typeof data !== "object" || depth > 3) return null;
  for (const key of ["text", "result", "response", "answer", "content", "output", "message", "data"]) {
    const found = pickText(data[key], depth + 1);
    if (found) return found;
  }
  return null;
};

// Markdown ala AI → format WhatsApp: **tebal** → *tebal*, # Judul → *Judul*, "* " → "• ".
export const markdownToWhatsApp = (text) =>
  String(text ?? "")
    .replace(/\r/g, "")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\*\*(.+?)\*\*/gs, "*$1*")
    .replace(/^(\s*)[*-]\s+/gm, "$1• ")
    .trim();

const firstString = (data, keys, depth = 0) => {
  if (!data || typeof data !== "object" || depth > 3) return undefined;
  for (const key of keys) if (typeof data[key] === "string" && data[key].trim()) return data[key].trim();
  for (const value of Object.values(data)) {
    const found = firstString(value, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
};

// ── Daftar ──────────────────────────────────────────────────────────────────
export const listOf = (data, depth = 0) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object" || depth > 2) return [];
  for (const key of LIST_KEYS) if (Array.isArray(data[key])) return data[key];
  for (const key of LIST_KEYS) {
    const inner = listOf(data[key], depth + 1);
    if (inner.length) return inner;
  }
  return Object.values(data).find(Array.isArray) ?? [];
};

const META_KEYS = ["description", "desc", "synopsis", "author", "artist", "channel", "uploader", "duration", "source", "publisher", "date", "publishedAt", "published", "views", "year", "episodes", "category", "type", "style"];

// Satu item daftar → { title, link, meta: [..] }
export const describeItem = (item) => {
  if (typeof item === "string") return isUrl(item) ? { title: item, link: item, meta: [] } : { title: item, meta: [] };
  if (!item || typeof item !== "object") return { title: String(item), meta: [] };
  const title = firstString(item, ["title", "name", "judul", "fullName", "text", "id"], 2) ?? "(tanpa judul)";
  const link = ["url", "link", "href", "permalink", "pageUrl"].map((k) => item[k]).find(isUrl);
  const meta = META_KEYS.map((k) => item[k]).filter((v) => (typeof v === "string" || typeof v === "number") && String(v).trim()).map((v) => String(v).trim().slice(0, 120)).slice(0, 3);
  return { title, link, meta };
};

export const numbered = (items, max = 10) =>
  listOf(items)
    .slice(0, max)
    .map((item, i) => {
      const { title, link, meta } = describeItem(item);
      return [`${i + 1}. *${title}*`, ...meta.map((m) => `   ${m}`), ...(link ? [`   ${link}`] : [])].join("\n");
    });

// ── Media ───────────────────────────────────────────────────────────────────
const EXT = {
  video: /\.(mp4|webm|mov|mkv|m4v)(\?|$)/i,
  audio: /\.(mp3|m4a|ogg|opus|wav|aac|flac)(\?|$)/i,
  image: /\.(jpe?g|png|webp|gif)(\?|$)/i,
};
const THUMB_KEY = /thumb|cover|poster|preview|avatar|icon|logo|banner/i;

const kindOf = (value, key) => {
  const data = value.match(DATA_RE);
  if (data) return ["video", "audio", "image"].includes(data[1]) ? data[1] : "file";
  const k = key.toLowerCase();
  if (EXT.video.test(value)) return "video";
  if (EXT.audio.test(value)) return "audio";
  if (EXT.image.test(value)) return THUMB_KEY.test(k) ? "thumb" : "image";
  if (THUMB_KEY.test(k)) return "thumb";
  if (/video|mp4|nowm|hd|play/.test(k)) return "video";
  if (/audio|mp3|music|sound/.test(k)) return "audio";
  if (/image|img|photo|picture/.test(k)) return "image";
  if (/download|file|link|url|dl|src/.test(k)) return "file";
  return null;
};

/*
 * Kumpulkan media dari respons: { video[], audio[], image[], file[], thumb[], title, filename }.
 * ignore = URL yang harus dilewati (mis. link input yang ikut di-echo API).
 */
export const collectMedia = (data, { ignore = [] } = {}) => {
  const out = { video: [], audio: [], image: [], file: [], thumb: [], title: undefined, filename: undefined };
  const seen = new Set(ignore);

  const walk = (value, key = "", depth = 0) => {
    if (value == null || depth > 6) return;
    if (typeof value === "string") {
      if ((!isUrl(value) && !DATA_RE.test(value)) || seen.has(value)) return;
      const kind = kindOf(value, key);
      if (!kind) return;
      seen.add(value);
      out[kind].push(value);
      return;
    }
    if (Array.isArray(value)) return value.forEach((v) => walk(v, key, depth + 1));
    if (typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, k, depth + 1);
  };
  walk(data);

  out.title = firstString(data, ["title", "name", "caption", "desc", "description"]);
  out.filename = firstString(data, ["filename", "fileName", "file_name"]);
  return out;
};

// data:…;base64 → Buffer, selain itu { url } — siap dipakai sebagai isi pesan media Baileys.
export const mediaSource = (value) => {
  const match = String(value).match(/^data:[^;]+;base64,(.+)$/s);
  return match ? Buffer.from(match[1], "base64") : { url: value };
};

export const audioMime = (url) => (/\.m4a(\?|$)/i.test(url) ? "audio/mp4" : /\.ogg|\.opus/i.test(url) ? "audio/ogg; codecs=opus" : "audio/mpeg");

export const fileNameOf = (url, fallback = "file") => {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? fallback) || fallback;
  } catch {
    return fallback;
  }
};

// ── Profil (stalker / info) ────────────────────────────────────────────────
const AVATAR_KEYS = ["avatar", "avatar_url", "avatarUrl", "profilePicture", "profile_pic", "picture", "pfp", "image", "thumbnail", "photo"];

// → { lines: ["• Nama: …"], avatar }
export const profileLines = (data, max = 14) => {
  const root = data?.result ?? data?.data ?? data ?? {};
  const obj = Array.isArray(root) ? (root[0] ?? {}) : root;
  const avatar = AVATAR_KEYS.map((k) => obj?.[k]).find(isUrl);
  const lines = Object.entries(obj)
    .filter(([k, v]) => {
      if (["status", "author"].includes(k) || AVATAR_KEYS.includes(k)) return false;
      return ["string", "number", "boolean"].includes(typeof v) && String(v).trim() !== "";
    })
    .slice(0, max)
    .map(([k, v]) => `• ${k.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())}: ${String(v).slice(0, 140)}`);
  return { lines, avatar };
};

const MIME = {
  pdf: "application/pdf", zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed",
  apk: "application/vnd.android.package-archive", txt: "text/plain", json: "application/json",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp4: "video/mp4", mkv: "video/x-matroska", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav", flac: "audio/flac",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};
export const mimeOf = (fileName) => MIME[String(fileName).split(".").pop().toLowerCase()] ?? "application/octet-stream";
