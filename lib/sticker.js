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

export const toWebp = async (buffer, { animated = false, fit = false } = {}) => {
  await fs.mkdir(config.paths.tmp, { recursive: true });
  const input = tmp(animated ? "mp4" : "img");
  const output = tmp("webp");
  await fs.writeFile(input, buffer);

  try {
    await run("ffmpeg", [
      "-y", "-i", input,
      ...(animated ? ["-t", "8", "-loop", "0"] : ["-frames:v", "1"]),
      "-an", "-vf", fit ? FIT : FILL,
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
