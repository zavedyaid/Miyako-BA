import { sniff } from "#lib/utils";

/*
 * Unggah file (gambar, video, audio, dokumen) ke Zavedya CDN → link publik.
 *   POST https://cdn.zavedya.id/upload   (multipart, field "file")
 *   uploadFile(buffer, { mimetype, fileName })  → untuk .tourl
 *   uploadImage(buffer, { mimetype })           → pembungkus untuk API yang butuh imageUrl
 * Link dibaca dari respons secara toleran: field url / link / fileUrl / … atau URL mana pun di JSON.
 */
const ENDPOINT = "https://cdn.zavedya.id/upload";
const ORIGIN = new URL(ENDPOINT).origin;
const URL_KEYS = ["url", "link", "fileUrl", "file_url", "href", "path", "file", "data", "result"];

const toUrl = (value) => {
  if (typeof value !== "string") return null;
  if (/^https?:\/\/\S+$/i.test(value)) return value;
  if (/^\/[^\s/]\S*$/.test(value)) return ORIGIN + value; // path relatif
  return null;
};

const findUrl = (data, depth = 0) => {
  if (depth > 4 || data == null) return null;
  const direct = toUrl(data);
  if (direct) return direct;
  if (typeof data !== "object") return null;
  for (const key of URL_KEYS) {
    const found = findUrl(data[key], depth + 1);
    if (found) return found;
  }
  for (const value of Object.values(data)) {
    const found = findUrl(value, depth + 1);
    if (found) return found;
  }
  return null;
};

const EXT = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-matroska": "mkv",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav", "audio/aac": "aac",
  "application/pdf": "pdf", "application/zip": "zip", "text/plain": "txt", "application/json": "json",
};

export const MAX_UPLOAD = 50 * 1024 * 1024; // 50 MB

export const uploadFile = async (buffer, { mimetype, fileName } = {}) => {
  if (!buffer?.length) throw new Error("File kosong.");
  if (buffer.length > MAX_UPLOAD) throw new Error(`File terlalu besar (maks ${MAX_UPLOAD / 1024 / 1024} MB).`);

  const sniffed = sniff(buffer);
  const type = mimetype?.split(";")[0] || sniffed.mime;
  const name = fileName || `file.${EXT[type] ?? sniffed.ext}`;

  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), name);

  const res = await fetch(ENDPOINT, { method: "POST", body: form, signal: AbortSignal.timeout(120_000) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(`Upload gagal (HTTP ${res.status})`);

  const url = findUrl(data);
  if (!url) throw new Error("Upload berhasil tapi link tidak ditemukan di respons CDN.");
  return url;
};

export const uploadImage = (buffer, { mimetype = "image/jpeg" } = {}) => uploadFile(buffer, { mimetype });
