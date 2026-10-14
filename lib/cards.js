import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "#lib/config";
import { getBuffer, sniff } from "#lib/utils";

/*
 * Kartu gambar untuk welcome, goodbye, dan level-up (latar dari config/cards, font Poppins dari config/fonts).
 * Dirender dengan ffmpeg (drawtext + overlay) — tanpa library tambahan; ffmpeg sudah dipakai bot untuk stiker.
 *
 *   const image = await renderCard("welcome", { name, group, count, avatar });   // Buffer JPEG 1280×720
 *
 * Latar bersih dibuat oleh tools/build-card-assets.py dari template (teks contoh dihapus).
 * Koordinat di bawah mengikuti kanvas 1920×1080 template.
 */
const OUT_W = 1280;
const OUT_H = 720;

const CARDS = path.join(config.paths.config, "cards");
const FONTS = path.join(config.paths.config, "fonts");
const FONT_FILE = { bold: "Poppins-Bold.ttf", medium: "Poppins-Medium.ttf" };

let metrics;
const widths = (font) => {
  metrics ??= JSON.parse(fs.readFileSync(path.join(CARDS, "metrics.json"), "utf8"));
  return metrics[font];
};

// Hanya huruf yang ada di font (emoji / aksara lain dibuang agar tidak jadi kotak).
const sanitize = (text, font) => {
  const w = widths(font);
  return [...String(text ?? "")].filter((ch) => w[ch] !== undefined).join("").replace(/\s+/g, " ").trim();
};

const measure = (text, font, size) => {
  const w = widths(font);
  let total = 0;
  for (const ch of text) total += (w[ch] ?? 0.6) * size;
  return total;
};

// Pilih ukuran terbesar (≤ max) yang muat di `width`; bila di ukuran min masih terlalu lebar → potong dengan "…".
export const fit = (text, font, width, max, min) => {
  let size = max;
  while (size > min && measure(text, font, size) > width) size -= 2;
  let out = text;
  while (out.length > 1 && measure(out, font, size) > width) out = `${out.slice(0, -2).trimEnd()}…`;
  return { text: out, size };
};

const run = (args, timeout = 25_000) =>
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

const esc = (p) => {
  if (p.includes("'")) throw new Error("Path berisi tanda kutip — tidak didukung.");
  return p.replaceAll("\\", "/").replaceAll(":", "\\:");
};

/* ── tata letak (kanvas 1920×1080) ─────────────────────────────────────── */
// text: [teks, font, cx, cy, lebar maks, ukuran maks, ukuran min, warna]
const LAYOUT = {
  welcome: {
    bg: "welcome-bg.png",
    avatar: { x: 84, y: 353, s: 376, mask: "mask-square.png" },
    texts: (d) => [
      { text: d.name, font: "bold", cx: 1350, cy: 318, width: 700, max: 64, min: 30, border: 2 },
      { text: "telah bergabung", font: "medium", cx: 1350, cy: 386, width: 700, max: 40, min: 40, alpha: 0.9 },
      { text: String(d.group).toUpperCase(), font: "bold", cx: 1352, cy: 560, width: 650, max: 66, min: 28, border: 2 },
      { text: `total ${d.count} member`, font: "medium", cx: 1563, cy: 965, width: 520, max: 50, min: 26 },
    ],
  },
  goodbye: {
    bg: "goodbye-bg.png",
    avatar: { x: 1016, y: 286, s: 376, mask: "mask-square.png" },
    texts: (d) => [
      { text: d.name, font: "bold", cx: 556, cy: 322, width: 560, max: 54, min: 28, border: 2 },
      { text: "telah keluar", font: "medium", cx: 556, cy: 384, width: 560, max: 38, min: 38, alpha: 0.9 },
      { text: `FROM ${String(d.group).toUpperCase()}`, font: "bold", cx: 575, cy: 553, width: 780, max: 60, min: 26, border: 2 },
      { text: `remaining ${d.count} member`, font: "medium", cx: 358, cy: 994, width: 520, max: 48, min: 26 },
    ],
  },
  levelup: {
    bg: "levelup-bg.png",
    avatar: { x: 135, y: 342, s: 400, mask: "mask-circle.png" },
    texts: (d) => [
      { text: String(d.oldLevel), font: "bold", cx: 688, cy: 542, width: 112, max: 68, min: 30, color: "0x1e1e2a" },
      { text: String(d.newLevel), font: "bold", cx: 1648, cy: 540, width: 112, max: 68, min: 30, color: "0x1e1e2a" },
      { text: `Sekarang level ${d.newLevel}`, font: "bold", cx: 1171, cy: 662, width: 620, max: 54, min: 28, border: 2 },
      { text: `@${d.name}`, font: "bold", cx: 317, cy: 824, width: 270, max: 42, min: 22, border: 2 },
    ],
    bar: { x: 812, y: 525, h: 28, max: 710 },
  },
};

export const renderCard = async (kind, data) => {
  const layout = LAYOUT[kind];
  if (!layout) throw new Error(`Kartu "${kind}" tidak dikenal.`);

  fs.mkdirSync(config.paths.tmp, { recursive: true });
  const base = path.join(config.paths.tmp, `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const temp = [];
  const write = (file, content) => {
    fs.writeFileSync(file, content);
    temp.push(file);
    return file;
  };

  try {
    const inputs = [path.join(CARDS, layout.bg)];
    const chain = ["[0:v]format=rgb24[s0]"];
    let last = "s0";
    let n = 1;
    const next = () => `s${n++}`;

    // avatar (opsional)
    if (data.avatar?.length) {
      const av = layout.avatar;
      const file = write(`${base}-avatar.${sniff(data.avatar).ext === "bin" ? "jpg" : sniff(data.avatar).ext}`, data.avatar);
      const i = inputs.push(file) - 1;
      const j = inputs.push(path.join(CARDS, av.mask)) - 1;
      const out = next();
      chain.push(
        `[${i}:v]scale=${av.s}:${av.s}:force_original_aspect_ratio=increase,crop=${av.s}:${av.s},format=rgba[a${i}]`,
        `[${j}:v]scale=${av.s}:${av.s},format=gray[m${j}]`,
        `[a${i}][m${j}]alphamerge[am${i}]`,
        `[${last}][am${i}]overlay=${av.x}:${av.y}[${out}]`,
      );
      last = out;
    }

    // bar progres (level-up): tutup kiri + tengah + tutup kanan
    if (layout.bar && Number.isFinite(data.ratio) && data.ratio > 0.01) {
      const { x, y, h, max } = layout.bar;
      const cap = h / 2;
      const w = Math.max(h + 2, Math.round(Math.min(1, data.ratio) * max));
      const li = inputs.push(path.join(CARDS, "bar-left.png")) - 1;
      const mi = inputs.push(path.join(CARDS, "bar-mid.png")) - 1;
      const ri = inputs.push(path.join(CARDS, "bar-right.png")) - 1;
      const o1 = next(), o2 = next(), o3 = next();
      chain.push(
        `[${mi}:v]scale=${w - h}:${h}[ms]`,
        `[${last}][ms]overlay=${x + cap}:${y}[${o1}]`,
        `[${o1}][${li}:v]overlay=${x}:${y}[${o2}]`,
        `[${o2}][${ri}:v]overlay=${x + w - cap}:${y}[${o3}]`,
      );
      last = o3;
    }

    // teks
    const draws = layout.texts(data).flatMap((item, idx) => {
      const clean = sanitize(item.text, item.font);
      if (!clean) return [];
      const { text, size } = fit(clean, item.font, item.width, item.max, item.min);
      const file = write(`${base}-t${idx}.txt`, text);
      const color = item.color ?? "white";
      const alpha = item.alpha ? `@${item.alpha}` : "";
      return `drawtext=fontfile='${esc(path.join(FONTS, FONT_FILE[item.font]))}':textfile='${esc(file)}':expansion=none:fontsize=${size}:fontcolor=${color}${alpha}:borderw=${item.border ?? 0}:bordercolor=black@0.4:x=${item.cx}-text_w/2:y=${item.cy}-${Math.round(size * 0.62)}`;
    });
    chain.push(`[${last}]${draws.join(",")}${draws.length ? "," : ""}scale=${OUT_W}:${OUT_H}:flags=lanczos[out]`);

    const output = `${base}.jpg`;
    temp.push(output);
    const args = ["-y", "-loglevel", "error", ...inputs.flatMap((file) => ["-i", file]), "-filter_complex", chain.join(";"), "-map", "[out]", "-frames:v", "1", "-q:v", "4", output];
    await run(args);
    return fs.readFileSync(output);
  } finally {
    for (const file of temp) fs.rmSync(file, { force: true });
  }
};

// Foto profil (JPEG) atau null — batas waktu pendek supaya notifikasi tidak tertahan.
export const fetchAvatar = async (sock, jid) => {
  try {
    const url = await Promise.race([sock.profilePictureUrl(jid, "image").catch(() => null), new Promise((r) => setTimeout(() => r(null), 5000))]);
    return url ? await getBuffer(url, { timeout: 8000 }) : null;
  } catch {
    return null;
  }
};
