import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { api, ApiError } from "#lib/api";
import { config } from "#lib/config";
import { pickText } from "#lib/extract";
import { uploadImage } from "#lib/upload";
import { t as tl } from "#lib/i18n";

/*
 * AI yang bisa "melihat": gambar → dikirim sebagai imageUrl, video → diambil satu frame (ffmpeg) lalu diperlakukan sebagai gambar.
 * Dipakai oleh semua command AI (.gemini .gpt …) dan AutoAI.
 *
 *   const visual = await attachVisual(ctx);          // null bila tidak ada gambar/video
 *   const data = await askAI("gemini", prompt, visual);
 *
 * Alurnya: gambar diunggah ke cdn.zavedya.id → GET /ai/<model>?prompt=…&imageUrl=<link>.
 * Bila model tidak bisa melihat (error, atau menjawab [TANPA_GAMBAR]), otomatis dicoba model berikutnya di VISION_CHAIN.
 * Ubah VISION_CHAIN / VISION_PARAM di sini bila API memakai nama lain.
 */
export const DEFAULT_VISION_PROMPT = "Jelaskan isi gambar ini secara singkat dan jelas.";
export const VISION_CHAIN = ["gemini", "gpt", "claude", "qwen", "kimi"];
export const VISION_PARAM = "imageUrl";
const MARK = "[TANPA_GAMBAR]";
// Model yang diminta ke API per penyedia. "gemini-3.6-flash" tidak ada di API → "Model tidak tersedia" (.gemini & AutoAI gagal).
const EXTRA = { gemini: { model: "gemini-2.5-flash" } };
const MODEL_ERR = /model.*(?:tidak tersedia|not (?:found|available|supported)|unavailable)|(?:tidak tersedia|unavailable).*model/i;

// GET /ai/<model>. Bila API menolak nama model di EXTRA, ulangi tanpa parameter model (pakai bawaan server) — jadi tidak mati lagi kalau nama modelnya berubah.
const callModel = async (candidate, params) => {
  const extra = EXTRA[candidate];
  try {
    return await api.get(`/ai/${candidate}`, { ...params, ...extra });
  } catch (err) {
    if (extra && MODEL_ERR.test(String(err?.message))) return api.get(`/ai/${candidate}`, params);
    throw err;
  }
};
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_TRIES = 3;

const run = (args, timeout = 30_000) =>
  new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeout);
    proc.stderr.on("data", (d) => (err += d));
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e.code === "ENOENT" ? new Error(tl("lb.vision.vision.1")) : e);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(tl("lb.vision.vision.2", { v: err.slice(-160).trim() })));
    });
  });

// Satu frame JPEG dari video (detik ke-1; kalau video lebih pendek, frame pertama).
export const frameFromVideo = async (buffer) => {
  fs.mkdirSync(config.paths.tmp, { recursive: true });
  const base = path.join(config.paths.tmp, `frame-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const input = `${base}.mp4`;
  const output = `${base}.jpg`;
  fs.writeFileSync(input, buffer);
  try {
    for (const at of ["1", "0"]) {
      await run(["-y", "-ss", at, "-i", input, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", output]).catch(() => {});
      if (fs.existsSync(output) && fs.statSync(output).size > 0) return fs.readFileSync(output);
    }
    throw new Error(tl("lb.vision.vision.3"));
  } finally {
    fs.rmSync(input, { force: true });
    fs.rmSync(output, { force: true });
  }
};

// Gambar / video dari pesan ini atau pesan yang di-reply → { url, kind } (null bila tidak ada).
export const attachVisual = async (ctx) => {
  const kind = ctx.mediaType ?? ctx.quotedMediaType;
  if (!["image", "video"].includes(kind)) return null;

  ctx.react?.("⏳");
  const media = await ctx.fetchMedia().catch(() => null);
  if (!media || !["image", "video"].includes(media.kind)) return null;
  if (media.buffer.length > MAX_BYTES) throw new ApiError(tl("lb.vision.vision.5", { v: media.kind === "video" ? "Video" : tl("lb.vision.vision.4"), v1: MAX_BYTES / 1024 / 1024 }));

  const isVideo = media.kind === "video";
  const buffer = isVideo ? await frameFromVideo(media.buffer) : media.buffer;
  const url = await uploadImage(buffer, { mimetype: isVideo ? "image/jpeg" : media.mimetype || "image/jpeg" });
  return { url, kind: media.kind };
};

const withVisual = (prompt, visual) =>
  [
    prompt,
    "",
    `[Lampiran: ${visual.kind === "video" ? "satu cuplikan (frame) dari sebuah video" : "sebuah gambar"} — ${visual.url}]`,
    `Jika kamu tidak dapat melihat lampiran tersebut, balas hanya dengan: ${MARK}`,
  ].join("\n");

/*
 * Tanya AI. Tanpa visual = GET /ai/<model>?prompt=… seperti biasa.
 * Dengan visual = coba <model> dulu, lalu model lain di VISION_CHAIN (maks 3 percobaan).
 * Hasil: JSON API + _via (model yang menjawab), _requested, _visual.
 */
export const askAI = async (model, prompt, visual = null) => {
  if (!visual) return callModel(model, { prompt });

  const order = [model, ...VISION_CHAIN.filter((m) => m !== model)].slice(0, MAX_TRIES);
  const full = withVisual(prompt, visual);
  let lastError;

  for (const candidate of order) {
    try {
      const data = await callModel(candidate, { prompt: full, [VISION_PARAM]: visual.url });
      const text = String(pickText(data) ?? "");
      if (text.includes(MARK) || !text.trim()) {
        lastError = new ApiError(tl("lb.vision.vision.6", { candidate }));
        continue;
      }
      return Object.assign(data, { _via: candidate, _requested: model, _visual: visual });
    } catch (err) {
      lastError = err;
    }
  }
  throw new ApiError(tl("lb.vision.vision.8", { v: visual.kind === "video" ? "video" : tl("lb.vision.vision.7"), v1: lastError?.message ?? "" }).trim());
};

// Catatan kecil di akhir jawaban bila model dialihkan / sumbernya video.
export const noteOf = (data) => {
  const notes = [];
  if (data?._via && data._via !== data._requested) notes.push(tl("lb.vision.vision.9", { _via: data._via, _requested: data._requested }));
  if (data?._visual?.kind === "video") notes.push(tl("lb.vision.vision.10"));
  return notes.length ? `\n\n_${notes.join(" • ")}_` : "";
};
