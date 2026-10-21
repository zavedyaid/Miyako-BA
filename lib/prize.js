import { randomInt } from "#lib/utils";

/*
 * Hadiah Gold ACAK untuk semua game (kira-kira 500–2000). Ubah angkanya di sini saja.
 *   prize()        → acak di seluruh rentang (PvP: catur menang, suit, UNO)
 *   scaled(p)      → p 0..1 = seberapa bagus hasilnya: rentang 500 … 500+1500·p (Dino, 2048, Abyss)
 *   levelBand(L)   → rentang per level (Catur vs AI, 8 level): L1 500–950 … L8 1550–2000
 */
export const PRIZE_MIN = 500;
export const PRIZE_MAX = 2000;

export const prize = (lo = PRIZE_MIN, hi = PRIZE_MAX) => randomInt(Math.round(lo), Math.round(Math.max(lo, hi)));

export const scaled = (p) => prize(PRIZE_MIN, PRIZE_MIN + (PRIZE_MAX - PRIZE_MIN) * Math.min(1, Math.max(0, Number(p) || 0)));

export const levelBand = (level, levels = 8, span = 450) => {
  const step = (PRIZE_MAX - PRIZE_MIN - span) / (levels - 1);
  const lo = Math.round((PRIZE_MIN + (Math.min(levels, Math.max(1, level)) - 1) * step) / 10) * 10;
  return [lo, Math.min(PRIZE_MAX, lo + span)];
};
export const bandText = (band, mult = 1) => `${Math.round(band[0] * mult)}–${Math.round(band[1] * mult)}`;
