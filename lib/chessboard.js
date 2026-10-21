import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "#lib/config";
import { colorOf, sqIndex } from "#lib/chess";
import { decodePng, encodePng } from "#lib/png";

const run = promisify(execFile);

/*
 * Kartu papan catur (JPEG 880×1000, atau 1280×720 dengan wide:true untuk link preview): papan + bidak digambar langsung (piksel), lalu nama/koordinat/status ditulis ffmpeg (Poppins).
 * Sprite bidak: config/chess/<w|b><p|n|b|r|q|k>.png (dibuat tools/build-chess-assets.py).
 */
const TALL = { W: 880, H: 1000, SQ: 96, BX: 56, BY: 116 };
// Layout LEBAR 1280×720 (16:9) untuk kartu link preview: WhatsApp memotong gambar preview ke rasio lebar (±1.8:1),
// jadi papan harus utuh di tengah dengan info pemain di kiri/kanan, semua dengan margin samping ≥ 70px (gambar portrait akan terpotong).
const WIDE = { W: 1280, H: 720, SQ: 72, BX: 352, BY: 64 };
const LIGHT = [226, 232, 246], DARK = [92, 124, 176], GOLD = [255, 205, 90], RED = [255, 70, 90];
const sprites = new Map();
const sprite = (name, size = 96) => {
  const key = `${name}@${size}`;
  if (!sprites.has(key)) {
    const src = sprites.get(name) ?? decodePng(fs.readFileSync(path.join(config.paths.config, "chess", `${name}.png`)));
    sprites.set(name, src);
    sprites.set(key, size === src.width ? src : shrink(src, size));
  }
  return sprites.get(key);
};
// Perkecil sprite dengan rata-rata area (alpha dibobot) supaya tepi bidak tetap halus.
const shrink = (src, size) => {
  const data = new Uint8Array(size * size * 4), k = src.width / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let j = Math.floor(y * k); j < Math.min(src.height, Math.ceil((y + 1) * k)); j++) for (let i = Math.floor(x * k); i < Math.min(src.width, Math.ceil((x + 1) * k)); i++) {
      const o = (j * src.width + i) * 4, al = src.data[o + 3];
      r += src.data[o] * al; g += src.data[o + 1] * al; b += src.data[o + 2] * al; a += al; n++;
    }
    const o = (y * size + x) * 4;
    if (a > 0) { data[o] = r / a; data[o + 1] = g / a; data[o + 2] = b / a; data[o + 3] = a / n; }
  }
  return { width: size, height: size, data };
};

export const renderBoard = async (st, { wide = false, flip = false, last = null, names, sub = {}, headRight = "", status = "", statusColor = "0xffd566", lastSan = "", toMove = st.turn, check = false, over = false } = {}) => {
  const { W, H, SQ, BX, BY } = wide ? WIDE : TALL;
  const px = new Uint8Array(W * H * 4);
  const blend = (x, y, [r, g, b], a) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4, k = 1 - a;
    px[i] = px[i] * k + r * a; px[i + 1] = px[i + 1] * k + g * a; px[i + 2] = px[i + 2] * k + b * a; px[i + 3] = 255;
  };
  const rect = (x0, y0, w, h, c, a = 1) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) blend(x, y, c, a); };
  const disc = (cx, cy, r, c, a = 1) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { const d = Math.hypot(x - cx, y - cy); if (d <= r) blend(x, y, c, d > r - 1 ? a * (r - d + 1) : a); } };
  const ring = (cx, cy, r, w, c) => { for (let y = cy - r - 1; y <= cy + r + 1; y++) for (let x = cx - r - 1; x <= cx + r + 1; x++) { const d = Math.hypot(x - cx, y - cy); if (d <= r && d >= r - w) blend(x, y, c, 1); } };

  // latar gradien
  for (let y = 0; y < H; y++) {
    const t = y / H, c = [Math.round(18 - 8 * t), Math.round(26 - 12 * t), Math.round(58 - 26 * t)];
    for (let x = 0; x < W; x++) blend(x, y, c, 1);
  }
  rect(BX - 10, BY - 10, SQ * 8 + 20, SQ * 8 + 20, [190, 215, 255], 0.22);

  const cell = (idx) => { const f = idx & 7, r = idx >> 3; return { x: BX + (flip ? 7 - f : f) * SQ, y: BY + (flip ? r : 7 - r) * SQ }; };
  for (let idx = 0; idx < 64; idx++) {
    const { x, y } = cell(idx);
    rect(x, y, SQ, SQ, ((idx & 7) + (idx >> 3)) % 2 === 0 ? DARK : LIGHT);
  }
  if (last) for (const idx of [last.from, last.to]) { const { x, y } = cell(idx); rect(x, y, SQ, SQ, GOLD, 0.5); }

  // raja yang sedang skak: cahaya merah radial
  const kingSq = st.board.indexOf(st.turn === "w" ? "K" : "k");
  if (check && kingSq >= 0) {
    const { x, y } = cell(kingSq), cx = x + SQ / 2, cy = y + SQ / 2;
    for (let yy = y; yy < y + SQ; yy++) for (let xx = x; xx < x + SQ; xx++) blend(xx, yy, RED, Math.max(0, 1 - Math.hypot(xx - cx, yy - cy) / (SQ * 0.72)) * 0.85);
  }

  for (let idx = 0; idx < 64; idx++) {
    const p = st.board[idx];
    if (!p) continue;
    const s = sprite(`${colorOf(p)}${p.toLowerCase()}`, SQ), { x, y } = cell(idx);
    for (let j = 0; j < s.height; j++) for (let i = 0; i < s.width; i++) {
      const o = (j * s.width + i) * 4, a = s.data[o + 3] / 255;
      if (a > 0) blend(x + i, y + j, [s.data[o], s.data[o + 1], s.data[o + 2]], a);
    }
  }

  // penanda pemain (lingkaran putih / hitam); pemain yang jalan diberi cincin emas
  const top = flip ? "w" : "b", bottom = flip ? "b" : "w";
  const spots = wide ? [[top, 95, 100], [bottom, 965, 620]] : [[top, 70, 58], [bottom, 70, 948]];
  for (const [side, cx, cy] of spots) {
    if (!over && toMove === side) ring(cx, cy, 24, 3, GOLD);
    disc(cx, cy, 17, side === "w" ? [250, 250, 252] : [30, 34, 48]);
    ring(cx, cy, 17, 2, side === "w" ? [28, 32, 48] : [236, 240, 250]);
  }

  // teks: ffmpeg drawtext (Poppins)
  const dir = config.paths.tmp, id = randomBytes(5).toString("hex");
  await fsp.mkdir(dir, { recursive: true });
  const input = path.join(dir, `chess-${id}.png`), output = path.join(dir, `chess-${id}.jpg`), temps = [input, output];
  const esc = (p) => p.replaceAll("\\", "/").replaceAll(":", "\\:");
  const filters = [];
  const text = async (value, { x, y, size = 30, font = "Bold", color = "white", right = false, center = false }) => {
    if (!String(value ?? "").trim()) return;
    const file = path.join(dir, `chess-${id}-${temps.length}.txt`);
    await fsp.writeFile(file, String(value), "utf8");
    temps.push(file);
    const xx = right ? `w-text_w-${x}` : center ? `${x}-text_w/2` : x;
    filters.push(`drawtext=fontfile='${esc(path.join(config.paths.config, "fonts", `Poppins-${font}.ttf`))}':textfile='${esc(file)}':fontcolor=${color}:fontsize=${size}:x=${xx}:y=${y}`);
  };
  const LABEL = "0x96b9eb";
  const files = "abcdefgh";
  const clip = (v, n) => { const a = [...String(v ?? "")]; return a.length > n ? `${a.slice(0, n - 1).join("")}…` : a.join(""); };
  if (wide) {
    for (let c = 0; c < 8; c++) {
      await text(files[flip ? 7 - c : c], { x: BX + c * SQ + SQ / 2, y: BY + SQ * 8 + 6, size: 18, font: "Medium", color: LABEL, center: true });
      await text(String(flip ? c + 1 : 8 - c), { x: BX - 16, y: BY + c * SQ + SQ / 2 - 12, size: 18, font: "Medium", color: LABEL, center: true });
    }
    await text(clip(names[top], 13), { x: 135, y: 76, size: 28 });
    await text(sub[top], { x: 135, y: 114, size: 20, font: "Medium", color: LABEL });
    await text(headRight, { x: 70, y: 60, size: 22, font: "Medium", color: LABEL, right: true });
    await text(clip(names[bottom], 13), { x: 1005, y: 596, size: 28 });
    await text(sub[bottom], { x: 1005, y: 634, size: 20, font: "Medium", color: LABEL });
    // status (boleh 2–3 baris) di kiri-bawah, langkah terakhir di bawahnya
    const words = String(status ?? "").split(/\s+/).filter(Boolean), rows = [];
    for (const w of words) (rows.at(-1) && rows.at(-1).length + w.length < 15 ? rows[rows.length - 1] += ` ${w}` : rows.push(w));
    const shown = rows.slice(0, 3);
    for (const [i, row] of shown.entries()) await text(row, { x: 70, y: 480 + i * 34, size: 25, color: statusColor });
    await text(lastSan, { x: 70, y: 480 + shown.length * 34 + 6, size: 20, font: "Medium", color: LABEL });
  } else {
    for (let c = 0; c < 8; c++) {
      await text(files[flip ? 7 - c : c], { x: BX + c * SQ + SQ / 2, y: BY + SQ * 8 + 14, size: 24, font: "Medium", color: LABEL, center: true });
      await text(String(flip ? c + 1 : 8 - c), { x: 28, y: BY + c * SQ + SQ / 2 - 18, size: 24, font: "Medium", color: LABEL, center: true });
    }
    await text(names[top], { x: 106, y: 30, size: 36 });
    await text(sub[top], { x: 106, y: 76, size: 22, font: "Medium", color: LABEL });
    await text(headRight, { x: 56, y: 44, size: 26, font: "Medium", color: LABEL, right: true });
    await text(names[bottom], { x: 106, y: 922, size: 36 });
    await text(sub[bottom], { x: 106, y: 966, size: 22, font: "Medium", color: LABEL });
    await text(status, { x: 56, y: 918, size: 30, color: statusColor, right: true });
    await text(lastSan, { x: 56, y: 964, size: 24, font: "Medium", color: LABEL, right: true });
  }

  try {
    await fsp.writeFile(input, encodePng(W, H, px));
    await run("ffmpeg", ["-y", "-i", input, "-vf", filters.join(","), "-q:v", "3", output]);
    return await fsp.readFile(output);
  } finally {
    await Promise.allSettled(temps.map((f) => fsp.rm(f)));
  }
};

export { sqIndex };

// Papan teks (cadangan bila gambar gagal dibuat).
const GLYPH = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
export const textBoard = (st, flip = false) => {
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const r = flip ? i : 7 - i;
    rows.push(`${r + 1} ${[...Array(8).keys()].map((c) => { const f = flip ? 7 - c : c, p = st.board[r * 8 + f]; return p ? GLYPH[p] : (r + f) % 2 === 0 ? "▪" : "▫"; }).join(" ")}`);
  }
  rows.push(`  ${[...Array(8).keys()].map((c) => "abcdefgh"[flip ? 7 - c : c]).join(" ")}`);
  return "```" + rows.join("\n") + "```";
};
