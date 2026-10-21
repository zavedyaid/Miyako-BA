import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "#lib/config";

const run = promisify(execFile);

// 1:1 (512×512). Default: isi penuh + crop tengah. "fit": seluruh gambar muat, sisi kosong transparan.
const FILL = "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,fps=15,format=rgba";
const FIT =
  "scale=512:512:force_original_aspect_ratio=decrease,fps=15,format=rgba," +
  "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000";

const tmp = (ext) => path.join(config.paths.tmp, `${randomBytes(6).toString("hex")}.${ext}`);

export const toWebp = async (buffer, { animated = false, fit = false, filters = [] } = {}) => {
  await fs.mkdir(config.paths.tmp, { recursive: true });
  const input = tmp(animated ? "mp4" : "img");
  const output = tmp("webp");
  await fs.writeFile(input, buffer);

  try {
    await run("ffmpeg", [
      "-y", "-i", input,
      ...(animated ? ["-t", "8", "-loop", "0"] : ["-frames:v", "1"]),
      "-an", "-vf", [fit ? FIT : FILL, ...filters].join(","),
      "-c:v", "libwebp", "-lossless", "0", "-q:v", "60", "-compression_level", "6",
      output,
    ]);
    return await fs.readFile(output);
  } finally {
    await Promise.allSettled([fs.rm(input), fs.rm(output)]);
  }
};

export const withExif = async (webp, { packname, author, emojis = [""] } = {}) => {
  const { default: webpmux } = await import("node-webpmux");
  const json = Buffer.from(
    JSON.stringify({
      "sticker-pack-id": "yuki-archive",
      "sticker-pack-name": packname ?? config.sticker?.packname ?? "",
      "sticker-pack-publisher": author ?? config.sticker?.author ?? "",
      emojis,
    }),
    "utf8",
  );
  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  const exif = Buffer.concat([header, json]);
  exif.writeUIntLE(json.length, 14, 4);

  await fs.mkdir(config.paths.tmp, { recursive: true });
  const input = tmp("webp");
  const output = tmp("webp");
  await fs.writeFile(input, webp);

  try {
    const image = new webpmux.Image();
    await image.load(input);
    image.exif = exif;
    await image.save(output);
    return await fs.readFile(output);
  } finally {
    await Promise.allSettled([fs.rm(input), fs.rm(output)]);
  }
};

export const makeSticker = async (buffer, { animated = false, fit = false, ...meta } = {}) =>
  withExif(await toWebp(buffer, { animated, fit }), meta);

/* ── stiker meme: teks atas / bawah (gaya impact: putih + garis hitam) ──────────────────────────────── */
const FONT = path.join(config.paths.config, "fonts", "Poppins-Bold.ttf");
export const MEME_MAX = 80;
const clean = (text) => String(text ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\p{Extended_Pictographic}|\uFE0F|\u200d/gu, "").replace(/\s+/g, " ").trim().toUpperCase();
const escPath = (p) => p.replaceAll("\\", "/").replaceAll(":", "\\:");

// Bungkus kata per baris (drawtext tidak membungkus sendiri).
const wrap = (text, maxChars) => {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && `${line} ${word}`.length > maxChars) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.flatMap((l) => (l.length > maxChars ? l.match(new RegExp(`.{1,${maxChars}}`, "g")) : [l])).slice(0, 4);
};

// Tiap baris digambar sendiri supaya benar-benar rata tengah.
const drawtext = async (text, where, files) => {
  const value = clean(text);
  if (!value) return [];
  const size = value.length <= 14 ? 60 : value.length <= 28 ? 48 : value.length <= 56 ? 38 : 30;
  const lines = wrap(value, Math.floor(480 / (size * 0.66)));
  const step = Math.round(size * 1.2), border = Math.max(3, Math.round(size / 10));
  const out = [];
  for (const [i, line] of lines.entries()) {
    const file = tmp("txt");
    await fs.writeFile(file, line, "utf8");
    files.push(file);
    const y = where === "top" ? 24 + i * step : `h-${24 + (lines.length - i) * step}`;
    out.push(`drawtext=fontfile='${escPath(FONT)}':textfile='${escPath(file)}':fontcolor=white:fontsize=${size}:borderw=${border}:bordercolor=black:x=(w-text_w)/2:y=${y}`);
  }
  return out;
};

export const makeMemeSticker = async (buffer, { top, bottom, animated = false, fit = false, ...meta } = {}) => {
  await fs.mkdir(config.paths.tmp, { recursive: true });
  const files = [];
  try {
    const filters = (await Promise.all([drawtext(top, "top", files), drawtext(bottom, "bottom", files)])).flat();
    return withExif(await toWebp(buffer, { animated, fit, filters }), meta);
  } finally {
    await Promise.allSettled(files.map((f) => fs.rm(f)));
  }
};
