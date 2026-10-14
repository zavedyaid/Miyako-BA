import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "#lib/config";
import { sniff } from "#lib/utils";

const run = (args, timeout = 90_000) =>
  new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeout);
    proc.stderr.on("data", (d) => (err += d));
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e.code === "ENOENT" ? new Error("ffmpeg belum terpasang di server.") : e);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`ffmpeg gagal: ${err.slice(-300).trim()}`));
    });
  });

export const STATUS_MAX_SECONDS = 60;

/*
 * Audio → video MP4 (gambar diam + suara) untuk status. WhatsApp tidak bisa menampilkan file audio biasa sebagai
 * status (muncul "versi WhatsApp tidak mendukung"), jadi musik harus dibungkus sebagai video (H.264 + AAC), maks 60 detik.
 * Gambar latar: config/thumbnail.jpg bila ada, kalau tidak layar gelap polos.
 */
export const audioToVideo = async (audio, { seconds = STATUS_MAX_SECONDS } = {}) => {
  fs.mkdirSync(config.paths.tmp, { recursive: true });
  const base = path.join(config.paths.tmp, `a2v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const input = `${base}-in.${sniff(audio).ext === "bin" ? "mp3" : sniff(audio).ext}`;
  const output = `${base}.mp4`;
  const cover = path.join(config.paths.config, "thumbnail.jpg");
  fs.writeFileSync(input, audio);

  const source = fs.existsSync(cover)
    ? ["-loop", "1", "-framerate", "2", "-i", cover]
    : ["-f", "lavfi", "-i", "color=c=0x14141e:s=720x720:r=2"];

  try {
    await run([
      "-y", "-loglevel", "error",
      ...source,
      "-i", input,
      "-t", String(seconds),
      "-vf", "scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2:color=0x14141e,format=yuv420p",
      "-c:v", "libx264", "-tune", "stillimage", "-preset", "veryfast", "-r", "2",
      "-c:a", "aac", "-b:a", "128k",
      "-shortest", "-movflags", "+faststart",
      output,
    ]);
    return fs.readFileSync(output);
  } finally {
    fs.rmSync(input, { force: true });
    fs.rmSync(output, { force: true });
  }
};
