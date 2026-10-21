import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "#lib/config";

/*
 * Level bernama (rank). Data di config/levels.json:
 *   maxLevel → level tertinggi (EXP berhenti bertambah di sana).  Mau 1000? Ubah angka ini dan tambah tier di bawahnya.
 *   tiers    → { from, name, emoji } diurutkan naik; rank berlaku mulai level `from` sampai sebelum tier berikutnya.
 */
const raw = JSON.parse(readFileSync(path.join(config.paths.config, "levels.json"), "utf8"));
const tiers = [...raw.tiers].sort((a, b) => a.from - b.from);

export const MAX_LEVEL = Math.max(1, Number(raw.maxLevel) || 100);
export const isMaxLevel = (level) => level >= MAX_LEVEL;

export const rankOf = (level) => {
  let found = tiers[0];
  for (const tier of tiers) if (level >= tier.from) found = tier;
  return found;
};
// "🌱 Rookie"
export const rankLabel = (level) => {
  const r = rankOf(level);
  return `${r.emoji} ${r.name}`;
};
// Tier berikutnya (atau null kalau sudah di tier tertinggi).
export const nextRank = (level) => tiers.find((tier) => tier.from > level) ?? null;
// Naik dari `before` ke `after` melewati batas tier?
export const rankedUp = (before, after) => rankOf(before).name !== rankOf(after).name;
