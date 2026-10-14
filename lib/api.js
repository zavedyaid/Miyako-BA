import { config } from "#lib/config";

/*
 * Router API Zavedya (https://api.zavedya.id) — HANYA sambungan.
 * Tidak ada daftar endpoint di sini; setiap plugin menyebut path & parameternya sendiri:
 *   const data = await api.get("/search/pinterest", { query: "aesthetic wallpaper", limit: 20 });
 *   → GET https://api.zavedya.id/v1/search/pinterest?query=aesthetic+wallpaper&limit=20
 *   await api.post("/ai/nanobanana", { prompt, imageUrl })     → POST (body JSON)
 * Mengembalikan JSON mentah; melempar ApiError kalau HTTP gagal atau status bukan "success".
 * Diatur di config.json → "api": { baseUrl, timeout }.
 */

export class ApiError extends Error {
  constructor(message, { status = 0, data = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

const baseUrl = () => String(config.api?.baseUrl ?? "https://api.zavedya.id").replace(/\/+$/, "");
const userAgent = () => `${String(config.name).replace(/\s+/g, "")}/${config.version} (+${config.social?.website ?? "https://zavedya.id"})`;

const send = async (method, path, { params = {}, body } = {}) => {
  const url = new URL(`${baseUrl()}/v1/${String(path).replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "User-Agent": userAgent(),
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(config.api?.timeout ?? 60_000),
    });
  } catch (err) {
    throw new ApiError(err.name === "TimeoutError" ? "API terlalu lama merespons." : `Gagal terhubung ke API: ${err.message}`);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data || (data.status && data.status !== "success")) {
    throw new ApiError(data?.message ?? data?.error ?? `API error (HTTP ${res.status})`, { status: res.status, data });
  }
  return data;
};

/*
 * Panggilan mentah (tidak melempar error) untuk .apitest: status HTTP, waktu respons, dan isi apa adanya.
 */
const raw = async (method, path, { params = {}, body, timeout = 25_000 } = {}) => {
  const url = new URL(`${baseUrl()}/v1/${String(path).replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "User-Agent": userAgent(),
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeout),
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {}
    return { url: url.href, status: res.status, ok: res.ok, ms: Math.round(performance.now() - started), data, text, contentType: res.headers.get("content-type") ?? "" };
  } catch (err) {
    return { url: url.href, status: 0, ok: false, ms: Math.round(performance.now() - started), data: null, text: "", error: err.name === "TimeoutError" ? "timeout" : err.message };
  }
};

export const api = {
  raw,
  get: (path, params) => send("GET", path, { params }),
  post: (path, body, params) => send("POST", path, { params, body }),
};
