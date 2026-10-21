import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "#lib/config";
import { currentLang, localeOf, t } from "#lib/i18n";
import { getBuffer, sniff } from "#lib/utils";
import { t as tl } from "#lib/i18n";

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
      reject(e.code === "ENOENT" ? new Error(tl("lb.cards.cards.1")) : e);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(tl("lb.cards.cards.2", { v: err.slice(-300).trim() })));
    });
  });

// Latar per bahasa: "<nama>.<kode>.png" (dibuat tools/build-*.py dengan CARD_LANG=<kode>); kalau tidak ada → "<nama>.png" (Indonesia).
const bgFile = (file) => {
  const lang = currentLang();
  if (lang === "id") return file;
  const variant = file.replace(".png", `.${lang}.png`);
  return fs.existsSync(path.join(CARDS, variant)) ? variant : file;
};

const esc = (p) => {
  if (p.includes("'")) throw new Error(tl("lb.cards.cards.3"));
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
      { text: t("card.members", { n: d.count }), font: "bold", left: 490, cy: 600, width: 210, max: 38, min: 22 },
      { text: d.date, font: "bold", left: 730, cy: 600, width: 410, max: 30, min: 18 },
      { text: t("card.newMember"), font: "bold", cx: 280, cy: 653, width: 260, max: 28, min: 18, color: "0xbfe3ff" },
    ],
  },
  goodbye: {
    bg: "goodbye-bg.png",
    avatar: { x: 780, y: 280, s: 300, mask: "mask-circle.png" },
    texts: (d) => [
      { text: d.name, font: "bold", left: 1140, cy: 340, width: 650, max: 54, min: 28 },
      { text: String(d.group).toUpperCase(), font: "bold", left: 1140, cy: 470, width: 650, max: 46, min: 24 },
      { text: t("card.members", { n: d.count }), font: "bold", left: 1140, cy: 600, width: 210, max: 38, min: 22 },
      { text: d.date, font: "bold", left: 1380, cy: 600, width: 410, max: 30, min: 18 },
      { text: t("card.hasLeft"), font: "bold", cx: 930, cy: 653, width: 260, max: 28, min: 18, color: "0xffd0d6" },
    ],
  },
  levelup: {
    bg: "levelup-bg.png",
    avatar: { x: 130, y: 280, s: 300, mask: "mask-circle.png" },
    texts: (d) => [
      { text: d.name, font: "bold", left: 490, cy: 340, width: 650, max: 54, min: 28 },
      { text: `Level ${d.oldLevel}`, font: "bold", left: 490, cy: 470, width: 210, max: 40, min: 22 },
      { text: `Level ${d.newLevel}`, font: "bold", left: 730, cy: 470, width: 410, max: 40, min: 22, color: "0xffd566" },
      { text: d.rank ? String(d.rank).toUpperCase() : `LEVEL ${d.newLevel}`, font: "bold", cx: 280, cy: 653, width: 260, max: 28, min: 18, color: "0xffe6a8" },
    ],
    bar: { x: 490, y: 600, h: 28, max: 650 },
  },
  // ── Kartu profil + RPG (latar: tools/build-rpg-assets.py) ──
  profile: {
    bg: "profile-bg.png",
    avatar: { x: 130, y: 280, s: 300, mask: "mask-circle.png" },
    texts: (d) => [
      { text: d.name, font: "bold", left: 490, cy: 340, width: 650, max: 54, min: 28 },
      { text: `${t("card.years", { n: d.age })}`, font: "bold", left: 490, cy: 470, width: 210, max: 42, min: 26 },
      { text: d.gender, font: "bold", left: 730, cy: 470, width: 410, max: 42, min: 26 },
      { text: `+${d.number}`, font: "bold", left: 490, cy: 600, width: 650, max: 42, min: 26 },
      { text: d.status, font: "bold", cx: 280, cy: 653, width: 260, max: 30, min: 18, color: "0xbfe3ff" },
      { text: `Lv ${d.level}${d.rank ? ` ${d.rank}` : ""}  ·  EXP ${d.exp} / ${d.need}  ·  ${Math.round(Math.min(1, d.ratio ?? 0) * 100)}%`, font: "bold", left: 250, cy: 722, width: 890, max: 32, min: 20, color: "0xffd566" },
      { text: String(d.limit), font: "bold", left: 130, cy: 900, width: 430, max: 38, min: 22 },
      { text: `${d.gold} G`, font: "bold", left: 620, cy: 900, width: 520, max: 38, min: 22 },
      { text: `SN ${d.sn}   ·   No. ${d.no}`, font: "bold", left: 132, cy: 968, width: 740, max: 28, min: 16, color: "0xbcd6ff" },
    ],
    boxes: (d) => [{ x: 132, y: 774, w: 1006 * Math.min(1, d.ratio ?? 0), h: 22, color: "0x6fd7ff" }],
  },
  hero: {
    bg: "hero-bg.png",
    avatar: { x: 130, y: 280, s: 300, mask: "mask-circle.png" },
    texts: (d) => [
      { text: d.name, font: "bold", left: 490, cy: 340, width: 650, max: 54, min: 28 },
      { text: `Lv ${d.lvl}`, font: "bold", left: 490, cy: 460, width: 150, max: 40, min: 22, color: "0xffd566" },
      { text: d.title, font: "bold", left: 670, cy: 460, width: 470, max: 34, min: 18 },
      { text: d.hpText, font: "bold", left: 640, cy: 520, width: 500, max: 24, min: 16, color: "0xff9aaa" },
      { text: d.stText, font: "bold", left: 690, cy: 610, width: 450, max: 24, min: 16, color: "0x9be7a8" },
      { text: d.xpText, font: "bold", left: 640, cy: 700, width: 500, max: 24, min: 16, color: "0xffd566" },
      { text: d.weapon, font: "bold", left: 490, cy: 842, width: 310, max: 28, min: 16 },
      { text: d.armor, font: "bold", left: 830, cy: 842, width: 310, max: 28, min: 16 },
      { text: String(d.atk), font: "bold", left: 130, cy: 780, width: 140, max: 38, min: 22 },
      { text: String(d.def), font: "bold", left: 290, cy: 780, width: 140, max: 38, min: 22 },
      { text: d.gold, font: "bold", left: 130, cy: 900, width: 140, max: 28, min: 14, color: "0xffd566" },
      { text: String(d.diamond), font: "bold", left: 290, cy: 900, width: 140, max: 28, min: 14, color: "0x7fe6ff" },
      { text: d.cls, font: "bold", cx: 280, cy: 653, width: 260, max: 28, min: 18, color: "0xffe6a8" },
      { text: d.footer, font: "medium", left: 132, cy: 966, width: 720, max: 21, min: 14, color: "0x96b9eb" },
    ],
    boxes: (d) => [
      { x: 492, y: 548, w: 646 * Math.min(1, d.hpR ?? 0), h: 18, color: "0xff6a85" },
      { x: 492, y: 638, w: 646 * Math.min(1, d.stR ?? 0), h: 18, color: "0x5fd68a" },
      { x: 492, y: 728, w: 646 * Math.min(1, d.xpR ?? 0), h: 18, color: "0xffc94d" },
    ],
  },
  // Inventory / toko: 12 slot (3 kolom × 4 baris). d.items = [{ name, l2, l3, icon, color }]
  grid: {
    bg: "grid-bg.png",
    texts: (d) => [
      { text: d.title, font: "bold", left: 132, cy: 150, width: 1050, max: 54, min: 30 },
      { text: d.subtitle, font: "medium", left: 134, cy: 197, width: 1050, max: 23, min: 14, color: "0x96c3ff" },
      { text: d.badge, font: "bold", cx: 1360, cy: 154, width: 190, max: 24, min: 14, color: "0x6fd7ff" },
      ...d.chips.map((c, i) => ({ text: c, font: "bold", cx: 280 + i * 330, cy: 268, width: 270, max: 26, min: 14 })),
      ...d.items.flatMap((it, i) => {
        const sx = 110 + (i % 3) * 450, sy = 330 + Math.floor(i / 3) * 150;
        return [
          { text: it.name, font: "bold", left: sx + 135, cy: sy + 36, width: 265, max: 28, min: 16 },
          { text: it.l2, font: "medium", left: sx + 135, cy: sy + 74, width: 265, max: 20, min: 13, color: "0x9fc4f5" },
          { text: it.l3, font: "bold", left: sx + 135, cy: sy + 106, width: 265, max: 24, min: 14, color: "0xffd566" },
        ];
      }),
      ...(d.items.length ? [] : [{ text: d.empty ?? t("card.empty"), font: "bold", cx: 745, cy: 600, width: 900, max: 40, min: 20, color: "0x9fc4f5" }]),
    ],
    icons: (d) => d.items.flatMap((it, i) => (it.avatar !== undefined ? [] : [{ name: it.icon, x: 110 + (i % 3) * 450 + 22, y: 330 + Math.floor(i / 3) * 150 + 17, s: 96 }])),
    // Foto profil per item (leaderboard): it.avatar = Buffer | null (null → lingkaran berwarna + huruf awal nama)
    avatars: (d) => d.items.flatMap((it, i) => (it.avatar !== undefined ? [{ buf: it.avatar, name: it.rawName ?? it.name, x: 110 + (i % 3) * 450 + 22, y: 330 + Math.floor(i / 3) * 150 + 17, s: 96, mask: "mask-circle.png" }] : [])),
    boxes: (d) => d.items.map((it, i) => ({ x: 110 + (i % 3) * 450, y: 330 + Math.floor(i / 3) * 150 + 14, w: 8, h: 102, color: it.color })),
  },
  // Hasil aksi RPG (berburu, menambang, hadiah, dst.). d.rows = [{ icon, text, sub }]
  result: {
    bg: "result-bg.png",
    avatar: { x: 130, y: 280, s: 300, mask: "mask-circle.png" },
    texts: (d) => [
      { text: d.title, font: "bold", left: 132, cy: 150, width: 770, max: 54, min: 30 },
      { text: d.subtitle, font: "medium", left: 134, cy: 197, width: 770, max: 23, min: 14, color: d.accent ?? "0x96c3ff" },
      { text: d.badge, font: "bold", cx: 1040, cy: 154, width: 190, max: 24, min: 14, color: d.accent ?? "0x6fd7ff" },
      { text: d.pill, font: "bold", cx: 280, cy: 653, width: 260, max: 28, min: 16, color: "0xbfe3ff" },
      { text: d.hpText, font: "bold", left: 190, cy: 720, width: 240, max: 22, min: 14, color: "0xff9aaa" },
      { text: d.xpText, font: "bold", left: 190, cy: 820, width: 240, max: 22, min: 14, color: "0xffd566" },
      { text: d.footer, font: "medium", left: 132, cy: 966, width: 720, max: 21, min: 14, color: "0x96b9eb" },
      ...d.rows.slice(0, 6).flatMap((r, i) => [
        { text: r.text, font: "bold", left: 580, cy: 314 + i * 92, width: 560, max: 32, min: 16 },
        ...(r.sub ? [{ text: r.sub, font: "medium", left: 580, cy: 348 + i * 92, width: 560, max: 20, min: 13, color: "0x9fc4f5" }] : []),
      ]),
    ],
    icons: (d) => d.rows.slice(0, 6).map((r, i) => ({ name: r.icon, x: 490, y: 300 + i * 92, s: 72 })),
    boxes: (d) => [
      { x: 132, y: 746, w: 296 * Math.min(1, d.hpR ?? 0), h: 18, color: "0xff6a85" },
      { x: 132, y: 846, w: 296 * Math.min(1, d.xpR ?? 0), h: 18, color: "0xffc94d" },
    ],
  },
  // Kartu ATM (bank RPG)
  atm: {
    bg: "atm-bg.png",
    texts: (d) => [
      { text: d.number, font: "bold", left: 190, cy: 600, width: 780, max: 64, min: 36 },
      { text: d.name, font: "bold", left: 190, cy: 735, width: 480, max: 36, min: 20 },
      { text: d.since, font: "bold", left: 720, cy: 735, width: 260, max: 36, min: 20 },
      { text: d.balance, font: "bold", left: 1130, cy: 340, width: 660, max: 54, min: 26, color: "0xffd566" },
      { text: d.wallet, font: "bold", left: 1130, cy: 470, width: 660, max: 46, min: 24 },
      { text: d.total, font: "bold", left: 1130, cy: 600, width: 660, max: 46, min: 24 },
      { text: d.interest, font: "bold", left: 1130, cy: 730, width: 660, max: 38, min: 22, color: "0x9be7a8" },
      { text: d.limit, font: "bold", left: 1130, cy: 860, width: 660, max: 34, min: 20 },
      { text: d.note, font: "medium", left: 132, cy: 872, width: 900, max: 26, min: 16, color: "0x9fc4f5" },
    ],
    boxes: (d) => [{ x: 1132, y: 902, w: 656 * Math.min(1, d.ratio ?? 0), h: 18, color: "0xffc94d" }],
  },
  // Kartu register. Latar & label tetap dibuat tools/build-register-bg.py; di sini hanya nilai yang berubah.
  // `left` = teks rata kiri mulai x itu; `cy` = garis tengah teks.
  register: {
    bg: "register-bg.png",
    avatar: { x: 130, y: 280, s: 300, mask: "mask-circle.png" },
    texts: (d) => [
      { text: d.name, font: "bold", left: 490, cy: 340, width: 650, max: 54, min: 28 },
      { text: `${t("card.years", { n: d.age })}`, font: "bold", left: 490, cy: 470, width: 210, max: 42, min: 26 },
      { text: d.gender, font: "bold", left: 730, cy: 470, width: 410, max: 42, min: 26 },
      { text: `+${d.number}`, font: "bold", left: 490, cy: 600, width: 650, max: 42, min: 26 },
      { text: d.status, font: "bold", cx: 280, cy: 653, width: 260, max: 30, min: 18, color: "0xbfe3ff" },
      { text: d.sn, font: "bold", left: 130, cy: 770, width: 430, max: 40, min: 24 },
      { text: `No. ${d.no}`, font: "bold", left: 620, cy: 770, width: 520, max: 40, min: 24 },
      { text: d.date, font: "bold", left: 130, cy: 890, width: 430, max: 30, min: 20 },
      { text: `Level ${d.level}${d.rank ? `  ·  ${d.rank}` : ""}`, font: "bold", left: 620, cy: 890, width: 520, max: 34, min: 22 },
    ],
  },
};

const ZONE = { "Asia/Jakarta": "WIB", "Asia/Pontianak": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT" };
const stampNow = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat(localeOf(), { timeZone: config.timezone, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}${ZONE[config.timezone] ? ` ${ZONE[config.timezone]}` : ""}`;
};

export const renderCard = async (kind, input) => {
  const layout = LAYOUT[kind];
  if (!layout) throw new Error(tl("lb.cards.cards.4", { kind }));
  const data = { ...input, name: readable(input.name, input.fallbackName ?? t("card.member")), group: readable(input.group, t("card.group")) };
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
    const inputs = [path.join(CARDS, bgFile(layout.bg))];
    const chain = ["[0:v]format=rgb24[s0]"];
    let last = "s0";
    let n = 1;
    const next = () => `s${n++}`;

    // avatar: foto profil, atau — bila tidak ada / disembunyikan — kotak berwarna dengan huruf awal nama
    let initial = null;
    if (layout.avatar) {
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

    // foto profil tambahan (mis. tiap baris leaderboard); tanpa foto → lingkaran berwarna + huruf awal
    const extraInitials = [];
    for (const [n, av] of (layout.avatars?.(data) ?? []).entries()) {
      let source;
      if (av.buf?.length) {
        const ext = sniff(av.buf).ext;
        source = write(`${base}-xa${n}.${ext === "bin" ? "jpg" : ext}`, av.buf);
      } else {
        source = { lavfi: `color=c=${placeholderColor(av.name)}:s=${av.s}x${av.s}:r=1` };
        extraInitials.push({ text: ([...readable(av.name, "?")].find((ch) => /[\p{L}\p{N}]/u.test(ch)) ?? "?").toUpperCase(), av });
      }
      const i = inputs.push(source) - 1;
      const j = inputs.push(path.join(CARDS, av.mask)) - 1;
      const out = next();
      chain.push(
        `[${i}:v]scale=${av.s}:${av.s}:force_original_aspect_ratio=increase,crop=${av.s}:${av.s},format=rgba[xa${i}]`,
        `[${j}:v]scale=${av.s}:${av.s},format=gray[xm${j}]`,
        `[xa${i}][xm${j}]alphamerge[xam${i}]`,
        `[${last}][xam${i}]overlay=${av.x}:${av.y}[${out}]`,
      );
      last = out;
    }

    // ikon item (config/cards/rpg/<nama>.png)
    for (const ic of layout.icons?.(data) ?? []) {
      let file = path.join(CARDS, "rpg", `${ic.name}.png`);
      if (!fs.existsSync(file)) file = path.join(CARDS, "rpg", "star.png");
      const i = inputs.push(file) - 1;
      const out = next();
      chain.push(`[${i}:v]scale=${ic.s}:${ic.s},format=rgba[ic${i}]`, `[${last}][ic${i}]overlay=${ic.x}:${ic.y}[${out}]`);
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
    if (initial && layout.avatar) {
      const av = layout.avatar;
      const size = Math.round(av.s * 0.5);
      items.push({ text: initial, font: "bold", cx: av.x + av.s / 2, cy: av.y + av.s / 2, width: av.s, max: size, min: size, color: "white", bias: 0.38 });
    }
    for (const { text, av } of extraInitials) items.push({ text, font: "bold", cx: av.x + av.s / 2, cy: av.y + av.s / 2, width: av.s, max: 52, min: 52, color: "white", bias: 0.38 });
    // kotak berwarna (bar HP/XP, penanda rarity): { x, y, w, h, color: "0xRRGGBB", alpha }
    const boxes = (layout.boxes?.(data) ?? [])
      .filter((b) => b.w >= 1)
      .map((b) => `drawbox=x=${Math.round(b.x)}:y=${Math.round(b.y)}:w=${Math.round(b.w)}:h=${Math.round(b.h)}:color=${b.color}@${b.alpha ?? 0.95}:t=fill`);
    const draws = items.flatMap((item, idx) => {
      const clean = sanitize(item.text, item.font);
      if (!clean) return [];
      const { text, size } = fit(clean, item.font, item.width, item.max, item.min);
      const file = write(`${base}-t${idx}.txt`, text);
      const color = item.color ?? "white";
      const alpha = item.alpha ? `@${item.alpha}` : "";
      return `drawtext=fontfile='${esc(path.join(FONTS, FONT_FILE[item.font]))}':textfile='${esc(file)}':expansion=none:fontsize=${size}:fontcolor=${color}${alpha}:borderw=${item.border ?? 0}:bordercolor=black@0.4:x=${item.left !== undefined ? item.left : `${item.cx}-text_w/2`}:y=${item.cy}-${Math.round(size * (item.bias ?? 0.62))}`;
    });
    draws.unshift(...boxes);
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

// Gambar kartu TANPA label "diteruskan dari channel" (label itu membuat gambar tampil seperti kartu link-preview).
// Mau tetap berlabel? config.json → features.cardChannelLabel = true.
export const imagePayload = (image, caption, mentions = []) => ({
  image,
  caption,
  mentions,
  ...(config.features?.cardChannelLabel ? {} : { contextInfo: { isForwarded: false, forwardingScore: 0, forwardedNewsletterMessageInfo: undefined } }),
});

export const cardPayload = (card, { text, mentions = [], title, body, style = "preview" }) =>
  style === "image"
    ? imagePayload(card, text, mentions)
    : { text, mentions, externalAdReply: { title, body, thumbnail: card, largeThumbnail: true, url: cardUrl() } };

// Cek lingkungan: ffmpeg + filter drawtext (libfreetype) + berkas aset. Mengembalikan { ok, reason }.
export const checkCards = async () => {
  for (const file of ["welcome-bg.png", "goodbye-bg.png", "levelup-bg.png", "register-bg.png", "profile-bg.png", "hero-bg.png", "grid-bg.png", "result-bg.png", "atm-bg.png", "metrics.json"]) {
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
      proc.on("error", (e) => reject(e.code === "ENOENT" ? new Error(tl("lb.cards.cards.5")) : e));
      proc.on("close", () => resolve(out));
    });
    if (!/\bdrawtext\b/.test(filters)) return { ok: false, reason: "ffmpeg tanpa filter drawtext (libfreetype) — pasang ffmpeg versi lengkap" };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
  return { ok: true };
};
