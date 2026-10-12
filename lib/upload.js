/*
 * Unggah gambar ke Zavedya CDN → link publik (untuk API yang butuh imageUrl).
 *   POST https://cdn.zavedya.id/upload   (multipart, field "file")
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

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export const uploadImage = async (buffer, { mimetype = "image/jpeg" } = {}) => {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimetype }), `image.${EXT[mimetype] ?? "jpg"}`);

  const res = await fetch(ENDPOINT, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(`Upload gagal (HTTP ${res.status})`);

  const url = findUrl(data);
  if (!url) throw new Error("Upload berhasil tapi link tidak ditemukan di respons CDN.");
  return url;
};
