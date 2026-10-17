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

// Huruf "bergaya" yang tidak diurai NFKC (small caps) → huruf biasa.
const SMALL_CAPS = { ᴀ: "A", ʙ: "B", ᴄ: "C", ᴅ: "D", ᴇ: "E", ꜰ: "F", ɢ: "G", ʜ: "H", ɪ: "I", ᴊ: "J", ᴋ: "K", ʟ: "L", ᴍ: "M", ɴ: "N", ᴏ: "O", ᴘ: "P", ʀ: "R", ꜱ: "S", ᴛ: "T", ᴜ: "U", ᴠ: "V", ᴡ: "W", ʏ: "Y", ᴢ: "Z" };

/*
 * Teks aman untuk font Poppins. Nama grup / pengguna sering memakai "font" Unicode (𝑀𝒊𝒚𝒂𝒌𝒐, ｍｉｙａｋｏ, ⓜⓘⓨⓐ, ᴍɪʏᴀᴋᴏ):
 * dinormalkan dulu ke huruf biasa. Emoji & aksara yang tidak ada di font dibuang, lalu tanda kurung yang jadi kosong dirapikan.
 */
const sanitize = (text, font) => {
  const w = widths(font);
  const plain = String(text ?? "").normalize("NFKC").replace(/[ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘʀꜱᴛᴜᴠᴡʏᴢ]/g, (ch) => SMALL_CAPS[ch]);
  return [...plain]
    .filter((ch) => w[ch] !== undefined)
    .join("")
    .replace(/\[\s*\]|\(\s*\)|\{\s*\}|<\s*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—|•·:]+|[\s\-–—|•·:]+$/g, "")
    .trim();
};

// Bersihkan; bila tak ada huruf / angka tersisa → pakai cadangan.
export const readable = (text, fallback) => {
  const clean = sanitize(text, "bold");
  return /[\p{L}\p{N}]/u.test(clean) ? clean : fallback;
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

// Warna latar avatar pengganti, tetap untuk nama yang sama.
const PALETTE = ["0x5b7fa6", "0x7a6fb0", "0xb06f8f", "0x4f9d8f", "0xc08a4e", "0x6f8f4f", "0xa5604f", "0x4f7fa5"];
const placeholderColor = (name) => PALETTE[[...String(name)].reduce((sum, ch) => sum + ch.codePointAt(0), 0) % PALETTE.length];

/* ── tata letak (kanvas 1920×1080) ─────────────────────────────────────── */
// text: [teks, font, cx, cy, lebar maks, ukuran maks, ukuran min, warna]
const LAYOUT = {
  // Welcome / goodbye / level-up: gaya sama dengan kartu register (dibuat tools/build-card-bgs.py).
  // `ox` = geser horizontal (goodbye: panel di kanan).
  welcome: {
    bg: "welcome-bg.png",
    avatar: { x: 130, y: 280, s: 300, mask: "mask-circle.png" },
    texts: (d) => [
      { text: d.name, font: "bold", left: 490, cy: 340, width: 650, max: 54, min: 28 },
      { text: String(d.group).toUpperCase(), font: "bold", left: 490, cy: 470, width: 650, max: 46, min: 24 },
      { text: `${d.count} member`, font: "bold", left: 490, cy: 600, width: 210, max: 38, min: 22 },
      { text: d.date, font: "bold", left: 730, cy: 600, width: 410, max: 30, min: 18 },
      { text: "MEMBER BARU", font: "bold", cx: 280, cy: 653, width: 260, max: 28, min: 18, color: "0xbfe3ff" },
    ],
  },
  goodbye: {
    bg: "goodbye-bg.png",
    avatar: { x: 780, y: 280, s: 300, mask: "mask-circle.png" },
    texts: (d) => [
      { text: d.name, font: "bold", left: 1140, cy: 340, width: 650, max: 54, min: 28 },
      { text: String(d.group).toUpperCase(), font: "bold", left: 1140, cy: 470, width: 650, max: 46, min: 24 },
      { text: `${d.count} member`, font: "bold", left: 1140, cy: 600, width: 210, max: 38, min: 22 },
      { text: d.date, font: "bold", left: 1380, cy: 600, width: 410, max: 30, min: 18 },
      { text: "TELAH KELUAR", font: "bold", cx: 930, cy: 653, width: 260, max: 28, min: 18, color: "0xffd0d6" },
    ],
  },
  levelup: {
    bg: "levelup-bg.png",
    avatar: { x: 130, y: 280, s: 300, mask: "mask-circle.png" },
    texts: (d) => [
      { text: d.name, font: "bold", left: 490, cy: 340, width: 650, max: 54, min: 28 },
      { text: `Level ${d.oldLevel}`, font: "bold", left: 490, cy: 470, width: 210, max: 40, min: 22 },
      { text: `Level ${d.newLevel}`, font: "bold", left: 730, cy: 470, width: 410, max: 40, min: 22, color: "0xffd566" },
      { text: `LEVEL ${d.newLevel}`, font: "bold", cx: 280, cy: 653, width: 260, max: 28, min: 18, color: "0xffe6a8" },
    ],
    bar: { x: 490, y: 600, h: 28, max: 650 },
  },
  // Kartu register. Latar & label tetap dibuat tools/build-register-bg.py; di sini hanya nilai yang berubah.
  // `left` = teks rata kiri mulai x itu; `cy` = garis tengah teks.
  register: {
    bg: "register-bg.png",
    avatar: { x: 130, y: 280, s: 300, mask: "mask-circle.png" },
    texts: (d) => [
      { text: d.name, font: "bold", left: 490, cy: 340, width: 650, max: 54, min: 28 },
      { text: `${d.age} tahun`, font: "bold", left: 490, cy: 470, width: 210, max: 42, min: 26 },
      { text: d.gender, font: "bold", left: 730, cy: 470, width: 410, max: 42, min: 26 },
      { text: `+${d.number}`, font: "bold", left: 490, cy: 600, width: 650, max: 42, min: 26 },
      { text: d.status, font: "bold", cx: 280, cy: 653, width: 260, max: 30, min: 18, color: "0xbfe3ff" },
      { text: d.sn, font: "bold", left: 130, cy: 770, width: 430, max: 40, min: 24 },
      { text: `No. ${d.no}`, font: "bold", left: 620, cy: 770, width: 520, max: 40, min: 24 },
      { text: d.date, font: "bold", left: 130, cy: 890, width: 430, max: 30, min: 20 },
      { text: `Level ${d.level}`, font: "bold", left: 620, cy: 890, width: 520, max: 34, min: 22 },
    ],
  },
};

const ZONE = { "Asia/Jakarta": "WIB", "Asia/Pontianak": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT" };
const stampNow = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("id-ID", { timeZone: config.timezone, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}${ZONE[config.timezone] ? ` ${ZONE[config.timezone]}` : ""}`;
};

export const renderCard = async (kind, input) => {
  const layout = LAYOUT[kind];
  if (!layout) throw new Error(`Kartu "${kind}" tidak dikenal.`);
  const data = { ...input, name: readable(input.name, input.fallbackName ?? "Member"), group: readable(input.group, "Grup") };
  if (kind === "welcome" || kind === "goodbye") data.date = stampNow();
  if (kind === "register") for (const key of ["gender", "status", "sn", "date"]) data[key] = String(input[key] ?? "-");

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

    // avatar: foto profil, atau — bila tidak ada / disembunyikan — kotak berwarna dengan huruf awal nama
    let initial = null;
    {
      const av = layout.avatar;
      let source;
      if (data.avatar?.length) {
        const ext = sniff(data.avatar).ext;
        source = write(`${base}-avatar.${ext === "bin" ? "jpg" : ext}`, data.avatar);
      } else {
        source = { lavfi: `color=c=${placeholderColor(data.name)}:s=${av.s}x${av.s}:r=1` };
        initial = ([...data.name].find((ch) => /[\p{L}\p{N}]/u.test(ch)) ?? "?").toUpperCase();
      }
      const i = inputs.push(source) - 1;
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
    const items = layout.texts(data);
    if (initial) {
      const av = layout.avatar;
      const size = Math.round(av.s * 0.5);
      items.push({ text: initial, font: "bold", cx: av.x + av.s / 2, cy: av.y + av.s / 2, width: av.s, max: size, min: size, color: "white", bias: 0.38 });
    }
    const draws = items.flatMap((item, idx) => {
      const clean = sanitize(item.text, item.font);
      if (!clean) return [];
      const { text, size } = fit(clean, item.font, item.width, item.max, item.min);
      const file = write(`${base}-t${idx}.txt`, text);
      const color = item.color ?? "white";
      const alpha = item.alpha ? `@${item.alpha}` : "";
      return `drawtext=fontfile='${esc(path.join(FONTS, FONT_FILE[item.font]))}':textfile='${esc(file)}':expansion=none:fontsize=${size}:fontcolor=${color}${alpha}:borderw=${item.border ?? 0}:bordercolor=black@0.4:x=${item.left !== undefined ? item.left : `${item.cx}-text_w/2`}:y=${item.cy}-${Math.round(size * (item.bias ?? 0.62))}`;
    });
    chain.push(`[${last}]${draws.join(",")}${draws.length ? "," : ""}scale=${OUT_W}:${OUT_H}:flags=lanczos[out]`);

    const output = `${base}.jpg`;
    temp.push(output);
    const args = ["-y", "-loglevel", "error", ...inputs.flatMap((input) => (typeof input === "string" ? ["-i", input] : ["-f", "lavfi", "-i", input.lavfi])), "-filter_complex", chain.join(";"), "-map", "[out]", "-frames:v", "1", "-q:v", "4", output];
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

/*
 * Payload pesan untuk sebuah kartu.
 *   preview → teks + link preview besar (externalAdReply)      image → gambar biasa + caption
 * Gaya disimpan di db.settings.cardStyle (.set owner cardstyle <preview|image>).
 */
/*
 * WhatsApp menyimpan thumbnail link preview berdasarkan URL-nya. Kalau semua kartu memakai URL yang sama, kartu pertama
 * muncul terus (goodbye tampil sebagai gambar welcome). Maka tiap kartu diberi URL unik lewat query ?card=…
 */
export const cardUrl = () => `${config.social?.github ?? "https://github.com/ZavedyaID"}?card=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const cardPayload = (card, { text, mentions = [], title, body, style = "preview" }) =>
  style === "image"
    ? { image: card, caption: text, mentions }
    : { text, mentions, externalAdReply: { title, body, thumbnail: card, largeThumbnail: true, url: cardUrl() } };

// Cek lingkungan: ffmpeg + filter drawtext (libfreetype) + berkas aset. Mengembalikan { ok, reason }.
export const checkCards = async () => {
  for (const file of ["welcome-bg.png", "goodbye-bg.png", "levelup-bg.png", "register-bg.png", "metrics.json"]) {
    if (!fs.existsSync(path.join(CARDS, file))) return { ok: false, reason: `aset config/cards/${file} tidak ada` };
  }
  for (const file of Object.values(FONT_FILE)) {
    if (!fs.existsSync(path.join(FONTS, file))) return { ok: false, reason: `font config/fonts/${file} tidak ada` };
  }
  try {
    const filters = await new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", ["-hide_banner", "-filters"], { stdio: ["ignore", "pipe", "ignore"] });
      let out = "";
      proc.stdout.on("data", (d) => (out += d));
      proc.on("error", (e) => reject(e.code === "ENOENT" ? new Error("ffmpeg belum terpasang") : e));
      proc.on("close", () => resolve(out));
    });
    if (!/\bdrawtext\b/.test(filters)) return { ok: false, reason: "ffmpeg tanpa filter drawtext (libfreetype) — pasang ffmpeg versi lengkap" };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
  return { ok: true };
};
