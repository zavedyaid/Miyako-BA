import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "#lib/config";
import { encodePng } from "#lib/png";
import { cardCode, isWild } from "#lib/uno";

const run = promisify(execFile);

/*
 * Gambar UNO (JPEG): kartu digambar piksel demi piksel, teks ditulis ffmpeg (Poppins) — sama seperti papan catur.
 *   renderHand  → tangan pemain (dikirim lewat chat pribadi), kartu yang bisa dimainkan diberi garis emas + kode ketiknya di bawah
 *   renderTable → meja di grup: kartu teratas, warna aktif, jumlah kartu lawan, giliran
 */
const COLOR = { r: [219, 54, 48], y: [242, 190, 30], g: [46, 160, 80], b: [44, 108, 222], w: [32, 34, 40] };
const INK = { r: [219, 54, 48], y: [196, 140, 0], g: [46, 160, 80], b: [44, 108, 222], w: [32, 34, 40] };
const GOLD = [255, 205, 90], WHITE = [250, 250, 252];

const makeCanvas = (W, H) => {
  const px = new Uint8Array(W * H * 4);
  const texts = [];
  const blend = (x, y, [r, g, b], a = 1) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4, k = 1 - a;
    px[i] = px[i] * k + r * a; px[i + 1] = px[i + 1] * k + g * a; px[i + 2] = px[i + 2] * k + b * a; px[i + 3] = 255;
  };
  const rect = (x0, y0, w, h, c, a = 1) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) blend(x, y, c, a); };
  const rrect = (x0, y0, w, h, rad, c, a = 1) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(x0 + rad - x, 0, x - (x0 + w - 1 - rad)), dy = Math.max(y0 + rad - y, 0, y - (y0 + h - 1 - rad));
      const d = Math.hypot(dx, dy);
      if (d <= rad) blend(x, y, c, d > rad - 1 ? a * (rad - d + 1) : a);
    }
  };
  const ellipse = (cx, cy, rx, ry, c, a = 1, quad = null) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d <= 1) blend(x, y, quad ? quad(x, y) : c, a);
    }
  };
  const text = (value, { x, y, size = 28, color = "white", font = "Bold", center = true } = {}) => {
    if (String(value ?? "").trim()) texts.push({ value: String(value), x, y, size, color, font, center });
  };
  return { W, H, px, blend, rect, rrect, ellipse, text, texts };
};

const background = (cv) => {
  for (let y = 0; y < cv.H; y++) {
    const t = y / cv.H, c = [Math.round(14 - 6 * t), Math.round(54 - 22 * t), Math.round(40 - 16 * t)];
    for (let x = 0; x < cv.W; x++) cv.blend(x, y, c, 1);
  }
};

const GLYPH = { skip: "SKIP", rev: "REV", "+2": "+2", wild: "WILD", "+4": "+4" };
const hex = (c) => `0x${c.map((n) => n.toString(16).padStart(2, "0")).join("")}`;

// Satu kartu: (x,y) pojok kiri-atas, ukuran w×h. glow = garis emas (bisa dimainkan) · dim = diredupkan
const drawCard = (cv, card, x, y, w, h, { glow = false, dim = false, color = null } = {}) => {
  const body = card ? COLOR[card.c] : [28, 28, 34];
  if (glow) cv.rrect(x - 6, y - 6, w + 12, h + 12, 16, GOLD);
  cv.rrect(x - 2, y - 2, w + 4, h + 4, 14, WHITE);
  cv.rrect(x, y, w, h, 12, card ? body : [24, 24, 30]);
  if (!card) {
    cv.ellipse(x + w / 2, y + h / 2, w * 0.36, h * 0.3, null, 1, (px, py) => (px < x + w / 2 ? [219, 54, 48] : [242, 190, 30]));
    if (w >= 90) cv.text("UNO", { x: x + w / 2, y: `${y + h / 2}-text_h/2`, size: Math.round(w * 0.24), color: "white" });
    return;
  }
  const cx = x + w / 2, cy = y + h / 2;
  if (isWild(card)) {
    cv.ellipse(cx, cy, w * 0.4, h * 0.3, null, 1, (px, py) => (px < cx ? (py < cy ? COLOR.r : COLOR.b) : (py < cy ? COLOR.y : COLOR.g)));
    if (card.v === "+4") cv.text("+4", { x: cx, y: `${cy}-text_h/2`, size: Math.round(w * 0.3), color: "white" });
  } else {
    cv.ellipse(cx, cy, w * 0.4, h * 0.3, WHITE, 1);
    const g = GLYPH[card.v] ?? card.v;
    cv.text(g, { x: cx, y: `${cy}-text_h/2`, size: g.length > 2 ? Math.round(w * 0.2) : Math.round(w * 0.42), color: hex(INK[card.c]) });
    cv.text(g, { x: x + w * 0.2, y: y + h * 0.06, size: Math.round(w * 0.16), color: "white" });
  }
  if (dim) cv.rrect(x, y, w, h, 12, [0, 0, 0], 0.5);
};

const finish = async (cv) => {
  const dir = config.paths.tmp, id = randomBytes(5).toString("hex");
  await fsp.mkdir(dir, { recursive: true });
  const input = path.join(dir, `uno-${id}.png`), output = path.join(dir, `uno-${id}.jpg`), temps = [input, output];
  const esc = (p) => p.replaceAll("\\", "/").replaceAll(":", "\\:");
  const filters = [];
  for (const t of cv.texts) {
    const file = path.join(dir, `uno-${id}-${temps.length}.txt`);
    await fsp.writeFile(file, t.value, "utf8");
    temps.push(file);
    const xx = t.center ? `${t.x}-text_w/2` : t.x;
    const yy = typeof t.y === "string" ? t.y : t.y;
    filters.push(`drawtext=fontfile='${esc(path.join(config.paths.config, "fonts", `Poppins-${t.font}.ttf`))}':textfile='${esc(file)}':fontcolor=${t.color}:fontsize=${t.size}:x=${xx}:y=${yy}`);
  }
  try {
    await fsp.writeFile(input, encodePng(cv.W, cv.H, cv.px));
    await run("ffmpeg", ["-y", "-i", input, ...(filters.length ? ["-vf", filters.join(",")] : []), "-q:v", "3", "-pix_fmt", "yuvj420p", "-strict", "unofficial", output]);
    return await fsp.readFile(output);
  } finally {
    await Promise.allSettled(temps.map((f) => fsp.rm(f)));
  }
};

const clip = (v, n) => { const a = [...String(v ?? "")]; return a.length > n ? `${a.slice(0, n - 1).join("")}…` : a.join(""); };

export const renderHand = async (hand, { playable = null, title = "", subtitle = "", newest = null } = {}) => {
  const CW = 118, CH = 172, GAP = 16, PER = 7, M = 36, HEAD = 96, ROW = CH + 62;
  const rows = Math.max(1, Math.ceil(hand.length / PER)), W = M * 2 + PER * CW + (PER - 1) * GAP, H = HEAD + rows * ROW + 20;
  const cv = makeCanvas(W, H);
  background(cv);
  cv.text(clip(title, 34), { x: M, y: 24, size: 34, center: false });
  cv.text(clip(subtitle, 60), { x: M, y: 66, size: 22, font: "Medium", color: "0x9fd8b5", center: false });
  hand.forEach((card, i) => {
    const r = Math.floor(i / PER), c = i % PER, inRow = Math.min(PER, hand.length - r * PER);
    const x0 = Math.round((W - (inRow * CW + (inRow - 1) * GAP)) / 2), x = x0 + c * (CW + GAP), y = HEAD + r * ROW + 8;
    const can = !playable || playable.has(cardCode(card));
    drawCard(cv, card, x, y, CW, CH, { glow: Boolean(playable) && can, dim: Boolean(playable) && !can });
    cv.text(cardCode(card), { x: x + CW / 2, y: y + CH + 14, size: 26, color: can ? "white" : "0x7f9a8a" });
    if (newest && cardCode(card) === cardCode(newest)) cv.text("NEW", { x: x + 12, y: y + CH - 30, size: 18, color: hex(GOLD), center: false });
  });
  return finish(cv);
};

const CN = { r: "RED", y: "YELLOW", g: "GREEN", b: "BLUE" };
// Meja untuk 2–10 pemain: daftar pemain di kiri (giliran ditandai), kartu teratas + warna aktif di tengah
export const renderTable = async ({ top, color, players, turn, dir = 1, drawLeft, status = "", last = "", over = false }) => {
  const W = 1000, H = 600, cv = makeCanvas(W, H);
  background(cv);
  const n = players.length, rowH = Math.min(54, Math.floor(520 / n)), y0 = Math.round((H - rowH * n) / 2);
  cv.rrect(24, y0 - 14, 400, rowH * n + 28, 16, [0, 0, 0], 0.22);
  players.forEach((pl, i) => {
    const y = y0 + i * rowH, active = !over && turn === i, mid = y + rowH / 2;
    if (active) cv.rrect(34, y + 2, 380, rowH - 4, 12, GOLD, 0.2);
    if (active) cv.ellipse(52, mid, 8, 8, GOLD, 1);
    cv.text(clip(pl.name, 13), { x: 72, y: `${mid}-text_h/2`, size: rowH >= 46 ? 28 : 22, color: active ? hex(GOLD) : "white", center: false });
    const cnt = `${pl.count}${pl.count === 1 ? " UNO!" : ""}`;
    cv.text(cnt, { x: `${400}-text_w`, y: `${mid}-text_h/2`, size: rowH >= 46 ? 26 : 20, font: "Medium", color: pl.count === 1 ? "0xff7a8a" : "0x9fd8b5", center: false });
  });
  // kartu teratas + cincin warna aktif
  const CW = 190, CH = 280, cx = 700, cy = 280;
  cv.ellipse(cx, cy, CW * 0.95, CH * 0.62, COLOR[color] ?? COLOR.w, 0.28);
  drawCard(cv, top, cx - CW / 2, cy - CH / 2, CW, CH);
  cv.text(CN[color] ?? "", { x: cx, y: cy + CH / 2 + 22, size: 26, color: "white" });
  drawCard(cv, null, 470, 80, 90, 126);
  cv.text(`DRAW ${drawLeft}`, { x: 515, y: 214, size: 18, font: "Medium", color: "0x9fd8b5" });
  if (n > 2) cv.text(dir === 1 ? "ORDER: CLOCKWISE" : "ORDER: COUNTER-CLOCKWISE", { x: 700, y: 24, size: 18, font: "Medium", color: "0x9fd8b5" });
  cv.text(clip(status, 26), { x: `w-text_w-40`, y: 508, size: 28, color: over ? "0x6fdc8c" : hex(GOLD), center: false });
  cv.text(clip(last, 44), { x: `w-text_w-40`, y: 552, size: 20, font: "Medium", color: "0x9fd8b5", center: false });
  return finish(cv);
};
