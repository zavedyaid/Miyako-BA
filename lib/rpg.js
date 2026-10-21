import { lex, localeOf, t } from "#lib/i18n";
import crypto from "node:crypto";
import { db } from "#lib/database";
import { config } from "#lib/config";
import { pick, randomInt, slugify } from "#lib/utils";
import { t as tl } from "#lib/i18n";

const dayOf = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/*
 * RPG Miyako-BA — data & aturan permainan (tanpa I/O). Tampilan kartu: lib/rpgui.js, perintah: plugins/rpg/*.
 * Data pemain: db.users[jid].rpg. Semua nilai di sini bisa diubah bebas (item, monster, harga, hadiah).
 */

export const RARITY = {
  1: { name: "Biasa", color: "0x9aa7b5" },
  2: { name: "Bagus", color: "0x6fdc8c" },
  3: { name: "Langka", color: "0x5aa9ff" },
  4: { name: "Epik", color: "0xb57bff" },
  5: { name: "Legendaris", color: "0xffc857" },
};

// id → { name, type: weapon|armor|potion|material|fish|crate, rar, sell, buy?, atk?, def?, heal?, stamina?, icon }
export const ITEMS = {
  atm: { name: "Kartu ATM", type: "tool", rar: 3, sell: 0, buy: 1500, unique: true, icon: "coin" },
  pedangkayu: { name: "Pedang Kayu", type: "weapon", rar: 1, atk: 3, sell: 40, buy: 150, icon: "sword" },
  pedangbesi: { name: "Pedang Besi", type: "weapon", rar: 2, atk: 8, sell: 250, buy: 800, icon: "sword" },
  pedangbaja: { name: "Pedang Baja", type: "weapon", rar: 3, atk: 15, sell: 900, buy: 2800, icon: "sword" },
  pedangmithril: { name: "Pedang Mithril", type: "weapon", rar: 4, atk: 28, sell: 3000, icon: "sword" },
  pedangnaga: { name: "Pedang Sisik Naga", type: "weapon", rar: 5, atk: 45, sell: 9000, icon: "sword" },
  bajukain: { name: "Baju Kain", type: "armor", rar: 1, def: 2, sell: 30, buy: 120, icon: "shield" },
  bajukulit: { name: "Baju Kulit", type: "armor", rar: 2, def: 5, sell: 200, buy: 600, icon: "shield" },
  zirahbesi: { name: "Zirah Besi", type: "armor", rar: 3, def: 10, sell: 600, buy: 1800, icon: "shield" },
  zirahbaja: { name: "Zirah Baja", type: "armor", rar: 4, def: 18, sell: 1800, buy: 5000, icon: "shield" },
  zirahnaga: { name: "Zirah Sisik Naga", type: "armor", rar: 5, def: 32, sell: 8000, icon: "shield" },
  potionhp: { name: "Potion HP", type: "potion", rar: 1, heal: 60, sell: 40, buy: 100, icon: "potion" },
  potionbesar: { name: "Potion Besar", type: "potion", rar: 2, heal: 180, sell: 110, buy: 280, icon: "potion" },
  elixir: { name: "Elixir", type: "potion", rar: 3, heal: 99999, sell: 350, buy: 900, icon: "potion" },
  energi: { name: "Minuman Energi", type: "potion", rar: 2, stamina: 50, sell: 100, buy: 250, icon: "heart" },
  kayu: { name: "Kayu", type: "material", rar: 1, sell: 6, icon: "leaf" },
  batu: { name: "Batu", type: "material", rar: 1, sell: 5, icon: "ore" },
  herbal: { name: "Herbal", type: "material", rar: 1, sell: 10, icon: "leaf" },
  kulit: { name: "Kulit Hewan", type: "material", rar: 1, sell: 15, icon: "bag" },
  taring: { name: "Taring", type: "material", rar: 2, sell: 25, icon: "fang" },
  besi: { name: "Bijih Besi", type: "material", rar: 2, sell: 20, icon: "ore" },
  emas: { name: "Bijih Emas", type: "material", rar: 3, sell: 60, icon: "ore" },
  kristal: { name: "Kristal", type: "material", rar: 3, sell: 150, icon: "gem" },
  mithril: { name: "Bijih Mithril", type: "material", rar: 4, sell: 400, icon: "gem" },
  sisiknaga: { name: "Sisik Naga", type: "material", rar: 5, sell: 600, icon: "star" },
  ikankecil: { name: "Ikan Kecil", type: "fish", rar: 1, sell: 15, icon: "fish" },
  ikanmas: { name: "Ikan Mas", type: "fish", rar: 2, sell: 40, icon: "fish" },
  tuna: { name: "Tuna", type: "fish", rar: 3, sell: 90, icon: "fish" },
  ikanlangka: { name: "Ikan Emas Langka", type: "fish", rar: 4, sell: 300, icon: "fish" },
  petikayu: { name: "Peti Kayu", type: "crate", rar: 1, sell: 80, buy: 400, icon: "crate" },
  petiemas: { name: "Peti Emas", type: "crate", rar: 3, sell: 400, icon: "crate" },
  petidiamond: { name: "Peti Berlian", type: "crate", rar: 4, sell: 1200, icon: "crate" },
};

export const TYPE_LABEL = { get weapon() { return lex("Senjata"); }, get armor() { return lex("Zirah"); }, get potion() { return lex("Ramuan"); }, get material() { return lex("Bahan"); }, get fish() { return lex("Ikan"); }, get crate() { return lex("Peti"); }, get tool() { return lex("Kartu"); } };

// Resep tempa: id → { bahan: jumlah, gold }
export const RECIPES = {
  pedangbesi: { besi: 6, kayu: 3, gold: 200 },
  bajukulit: { kulit: 6, herbal: 2, gold: 100 },
  zirahbesi: { besi: 10, kulit: 4, gold: 400 },
  pedangbaja: { besi: 12, kristal: 3, gold: 800 },
  zirahbaja: { besi: 14, kristal: 4, gold: 1200 },
  pedangmithril: { mithril: 8, kristal: 5, besi: 10, gold: 2500 },
  pedangnaga: { sisiknaga: 10, mithril: 6, kristal: 6, gold: 8000 },
  zirahnaga: { sisiknaga: 12, mithril: 6, kristal: 6, gold: 8000 },
};

// Peti: gold [min,max], diamond [peluang, min, max], items [id, peluang, min, max]
const CRATES = {
  petikayu: { gold: [100, 300], diamond: [0, 0, 0], items: [["potionhp", 0.6, 1, 2], ["kayu", 1, 2, 5], ["besi", 0.3, 1, 3]] },
  petiemas: { gold: [500, 1200], diamond: [0.35, 1, 2], items: [["potionbesar", 0.7, 1, 2], ["kristal", 0.4, 1, 2], ["emas", 0.6, 1, 3], ["energi", 0.3, 1, 1]] },
  petidiamond: { gold: [1500, 3500], diamond: [0.9, 3, 6], items: [["mithril", 0.6, 1, 3], ["elixir", 0.5, 1, 2], ["petiemas", 0.3, 1, 1], ["kristal", 0.7, 2, 4]] },
};

// Monster: [nama, minLevel, hp, atk, def, xp, [goldMin, goldMax], drops [[id, peluang, min, max]]]
const M = (name, minLv, hp, atk, def, xp, gold, drops) => ({ name, minLv, hp, atk, def, xp, gold, drops });
export const MONSTERS = [
  M("Slime", 1, 30, 6, 1, 12, [8, 18], [["herbal", 0.5, 1, 2], ["kulit", 0.2, 1, 1]]),
  M("Serigala", 1, 50, 9, 2, 20, [12, 25], [["kulit", 0.6, 1, 2], ["taring", 0.4, 1, 1]]),
  M("Goblin", 3, 60, 11, 3, 26, [15, 30], [["kayu", 0.7, 1, 3], ["kulit", 0.4, 1, 1], ["petikayu", 0.05, 1, 1]]),
  M("Kelelawar Raksasa", 6, 90, 16, 4, 45, [25, 50], [["taring", 0.6, 1, 2], ["herbal", 0.3, 1, 2]]),
  M("Troll Batu", 6, 160, 22, 9, 80, [40, 80], [["batu", 0.8, 2, 4], ["besi", 0.5, 1, 2], ["petikayu", 0.08, 1, 1]]),
  M("Laba-laba Kristal", 9, 130, 26, 6, 90, [50, 90], [["kristal", 0.25, 1, 1], ["taring", 0.5, 1, 2]]),
  M("Golem Besi", 12, 300, 34, 18, 150, [80, 140], [["besi", 0.8, 2, 4], ["mithril", 0.15, 1, 1], ["petiemas", 0.06, 1, 1]]),
  M("Griffin", 12, 260, 42, 12, 170, [90, 150], [["taring", 0.6, 1, 3], ["kulit", 0.6, 2, 4]]),
  M("Ogre", 15, 380, 46, 16, 200, [110, 180], [["kulit", 0.7, 2, 4], ["emas", 0.4, 1, 2]]),
  M("Ksatria Kegelapan", 20, 600, 65, 30, 420, [200, 360], [["kristal", 0.4, 1, 2], ["emas", 0.5, 1, 3], ["mithril", 0.25, 1, 2], ["petiemas", 0.1, 1, 1]]),
  M("Penyihir Lich", 20, 520, 85, 20, 500, [240, 420], [["kristal", 0.5, 1, 3], ["mithril", 0.3, 1, 2], ["petiemas", 0.12, 1, 1]]),
];
export const BOSSES = [
  M("Raja Slime", 5, 250, 20, 8, 150, [100, 200], [["petikayu", 1, 1, 1], ["herbal", 1, 2, 4]]),
  M("Raja Troll", 12, 700, 40, 20, 450, [300, 600], [["petiemas", 1, 1, 1], ["besi", 1, 3, 6], ["mithril", 0.3, 1, 2]]),
  M("Naga Api", 20, 1500, 110, 45, 2000, [800, 1500], [["sisiknaga", 1, 3, 6], ["petidiamond", 0.3, 1, 1], ["mithril", 0.8, 2, 4]]),
];

export const xpNeed = (lvl) => Math.round(40 * lvl + 15 * lvl * lvl);
export const titleOf = (lvl) => lex(lvl < 5 ? "Petualang Pemula" : lvl < 10 ? "Petualang" : lvl < 20 ? "Ksatria" : lvl < 30 ? "Pahlawan" : "Legenda");

// Nama item / rarity / monster / boss / misi diterjemahkan saat dipakai (lex) — Indonesia = teks asli.
const lexName = (obj) => {
  const original = obj.name;
  Object.defineProperty(obj, "name", { get: () => lex(original), enumerable: true, configurable: true });
};
[...Object.values(ITEMS), ...Object.values(RARITY), ...MONSTERS, ...BOSSES].forEach(lexName);
export const STAMINA_MAX = 100;

/* ── data pemain ─────────────────────────────────────────────────────────── */
export const getRpg = (user) => {
  if (!user.rpg) {
    user.rpg = {
      lvl: 1, xp: 0, hp: 100, stamina: STAMINA_MAX, gold: 0, diamond: 0,
      inv: { pedangkayu: 1, bajukain: 1 }, equip: { weapon: "pedangkayu", armor: "bajukain" },
      t: Date.now(), daily: { last: "", streak: 0 }, weekly: 0, kills: 0, dungeons: 0, gift: false,
    };
  }
  const r = user.rpg;
  r.bank ??= 0; r.bankAt ??= 0; r.cd ??= {}; r.q ??= { day: "", kill: 0, mine: 0, fish: 0, claimed: false };
  r.drv ??= { ojol: 0, gocar: 0, gofood: 0, total: 0, star5: 0 };
  r.pvp ??= { duelWin: 0, duelLose: 0, suitWin: 0, suitLose: 0, suitDraw: 0, raceWin: 0, raceLose: 0 };
  refresh(r);
  return r;
};

export const statsOf = (r) => {
  const w = ITEMS[r.equip.weapon], a = ITEMS[r.equip.armor];
  return { maxHp: 100 + (r.lvl - 1) * 25, atk: 5 + (r.lvl - 1) * 2 + (w?.atk ?? 0), def: 2 + (r.lvl - 1) + (a?.def ?? 0) };
};

// HP pulih 1 per 20 dtk, stamina 1 per 45 dtk (dihitung saat dibutuhkan).
export const refresh = (r) => {
  const now = Date.now(), dt = Math.max(0, now - (r.t ?? now)), { maxHp } = statsOf(r);
  r.stamina = Math.min(STAMINA_MAX, r.stamina + Math.floor(dt / 45_000));
  r.hp = Math.min(maxHp, r.hp + Math.floor(dt / 20_000));
  r.t = r.stamina >= STAMINA_MAX && r.hp >= maxHp ? now : r.t + Math.floor(dt / 45_000) * 45_000;
  if (r.hp > maxHp) r.hp = maxHp;
  return r;
};

export const count = (r, id) => r.inv[id] ?? 0;
export const addItem = (r, id, n = 1) => { r.inv[id] = (r.inv[id] ?? 0) + n; };
export const takeItem = (r, id, n = 1) => {
  if (count(r, id) < n) return false;
  r.inv[id] -= n;
  if (r.inv[id] <= 0) { delete r.inv[id]; for (const slot of ["weapon", "armor"]) if (r.equip[slot] === id) r.equip[slot] = null; }
  return true;
};

// Cari item dari id / nama (tanpa spasi, tanpa huruf besar): "pedang kayu" → pedangkayu
export const findItem = (query) => {
  const q = slugify(query);
  if (!q) return null;
  if (ITEMS[q]) return q;
  return Object.keys(ITEMS).find((id) => slugify(ITEMS[id].name) === q) ?? Object.keys(ITEMS).find((id) => id.startsWith(q) || slugify(ITEMS[id].name).includes(q)) ?? null;
};

/* ── XP & level ──────────────────────────────────────────────────────────── */
export const addXp = (r, amount) => {
  r.xp += amount;
  const ups = [];
  while (r.xp >= xpNeed(r.lvl)) {
    r.xp -= xpNeed(r.lvl); r.lvl++;
    const bonus = 100 * r.lvl; r.gold += bonus; ups.push({ lvl: r.lvl, bonus });
    r.hp = statsOf(r).maxHp;
  }
  return ups;
};

/* ── hadiah ──────────────────────────────────────────────────────────────── */
const rarOf = (id) => RARITY[ITEMS[id]?.rar ?? 1];
export const itemRow = (id, n) => ({ icon: ITEMS[id].icon, text: `${ITEMS[id].name} x${n}`, sub: `${RARITY[ITEMS[id].rar].name} · ${TYPE_LABEL[ITEMS[id].type]}` });

// Terapkan tabel drop → baris hasil.
export const rollDrops = (r, drops) => {
  const rows = [];
  for (const [id, chance, lo, hi] of drops) if (Math.random() < chance) { const n = randomInt(lo, hi); addItem(r, id, n); rows.push(itemRow(id, n)); }
  return rows;
};
export const goldRow = (n) => ({ icon: "coin", text: `+${n.toLocaleString(localeOf())} Gold`, sub: t("row.money") });
export const diamondRow = (n) => ({ icon: "gem", text: `+${t("row.diamond", { n })}`, sub: t("row.premium") });
export const xpRows = (r, xp) => {
  const rows = [{ icon: "star", text: `+${xp} XP`, sub: t("row.exp") }];
  for (const up of addXp(r, xp)) rows.push({ icon: "star", text: t("row.levelUp", { lvl: up.lvl }), sub: t("row.levelUpSub", { bonus: up.bonus }) });
  return rows;
};

// Buka 1 peti → { gold, diamond, items: { id: n } } (jumlah digabung oleh crateRows).
export const openCrate = (r, id) => {
  const c = CRATES[id], out = { gold: randomInt(...c.gold), diamond: 0, items: {} };
  r.gold += out.gold;
  if (Math.random() < c.diamond[0]) { out.diamond = randomInt(c.diamond[1], c.diamond[2]); r.diamond += out.diamond; }
  for (const [item, chance, lo, hi] of c.items) if (Math.random() < chance) { const n = randomInt(lo, hi); addItem(r, item, n); out.items[item] = (out.items[item] ?? 0) + n; }
  return out;
};
export const crateRows = (outs) => {
  const gold = outs.reduce((a, o) => a + o.gold, 0), diamond = outs.reduce((a, o) => a + o.diamond, 0), items = {};
  for (const o of outs) for (const [k, v] of Object.entries(o.items)) items[k] = (items[k] ?? 0) + v;
  return [goldRow(gold), ...(diamond ? [diamondRow(diamond)] : []), ...Object.entries(items).map(([k, v]) => itemRow(k, v))];
};
export const isCrate = (id) => Boolean(CRATES[id]);

/* ── pertarungan ─────────────────────────────────────────────────────────── */
export const fight = (stats, mon, hp) => {
  let mhp = mon.hp, rounds = 0;
  while (hp > 0 && mhp > 0 && rounds < 60) {
    rounds++;
    let dmg = Math.max(1, Math.round(stats.atk * (0.85 + Math.random() * 0.3) - mon.def * 0.5));
    if (Math.random() < 0.1) dmg = Math.round(dmg * 1.8);
    mhp -= dmg;
    if (mhp <= 0) break;
    hp -= Math.max(1, Math.round(mon.atk * (0.85 + Math.random() * 0.3) - stats.def * 0.6));
  }
  return { win: mhp <= 0, hp: Math.max(0, hp), rounds };
};

const eligible = (lvl) => MONSTERS.filter((m) => m.minLv <= lvl).slice(-4);

// Hasil aksi = { title, subtitle, badge, accent, rows, ok }  (ditampilkan sebagai kartu "result")
const need = (r, cost) => (r.stamina < cost ? tl("rpgl.1", { stamina: r.stamina, cost }) : null);
const lowHp = (r) => (r.hp < statsOf(r).maxHp * 0.15 ? tl("rpgl.2") : null);
export const preflight = (r, cost, needsHp = true) => need(r, cost) ?? (needsHp ? lowHp(r) : null);

export const hunt = (r) => {
  r.stamina -= 10;
  const mon = pick(eligible(r.lvl)), st = statsOf(r), res = fight(st, mon, r.hp);
  r.hp = Math.max(1, res.hp);
  if (!res.win) {
    const lost = Math.min(r.gold, Math.round(r.gold * 0.05));
    r.gold -= lost; r.hp = Math.max(1, Math.round(st.maxHp * 0.1));
    return { title: tl("rpgl.3"), subtitle: tl("rpgl.4", { name: mon.name }), badge: tl("rpgl.5"), accent: "0xff8a9a", rows: [{ icon: "heart", text: tl("rpgl.6"), sub: tl("rpgl.7", { rounds: res.rounds }) }, ...(lost ? [{ icon: "coin", text: tl("rpgl.8", { lost }), sub: tl("rpgl.9") }] : [])], ok: false };
  }
  r.kills++; track(r, "kill");
  const gold = randomInt(...mon.gold); r.gold += gold;
  const rows = [goldRow(gold), ...rollDrops(r, mon.drops), ...xpRows(r, mon.xp)];
  return { title: tl("rpgl.10"), subtitle: tl("rpgl.11", { name: mon.name, rounds: res.rounds }), badge: tl("rpgl.12"), accent: "0x6fdc8c", rows, ok: true };
};

export const dungeon = (r) => {
  r.stamina -= 30;
  const st = statsOf(r), boss = [...BOSSES].reverse().find((b) => b.minLv <= r.lvl) ?? BOSSES[0];
  const foes = [...Array(3)].map(() => pick(eligible(r.lvl)));
  let hp = r.hp, xp = 0, gold = 0; const loot = [], beaten = [];
  for (const foe of [...foes, boss]) {
    const res = fight(st, foe, hp); hp = res.hp;
    if (!res.win) {
      r.hp = Math.max(1, Math.round(st.maxHp * 0.1)); const lost = Math.min(r.gold, Math.round(r.gold * 0.1)); r.gold -= lost;
      return { title: tl("rpgl.13"), subtitle: tl("rpgl.14", { name: foe.name, length: beaten.length }), badge: tl("rpgl.15"), accent: "0xff8a9a", rows: [{ icon: "heart", text: tl("rpgl.16"), sub: beaten.length ? tl("rpgl.17", { v: beaten.join(", ") }) : tl("rpgl.18") }, ...(lost ? [{ icon: "coin", text: tl("rpgl.19", { lost }), sub: tl("rpgl.20") }] : [])], ok: false };
    }
    beaten.push(foe.name); xp += foe.xp; const g = randomInt(...foe.gold); gold += g; r.kills++; track(r, "kill");
    loot.push(...foe.drops);
  }
  r.hp = Math.max(1, hp); r.gold += gold; r.dungeons++;
  const rows = [goldRow(gold), ...rollDrops(r, loot), ...xpRows(r, xp)];
  return { title: tl("rpgl.21"), subtitle: tl("rpgl.22", { name: boss.name }), badge: tl("rpgl.23"), accent: "0xffd566", rows, ok: true };
};

export const mine = (r) => {
  r.stamina -= 8; track(r, "mine");
  const table = [["batu", 1, 1, 3, 1], ["besi", 0.45, 1, 2, 1], ["emas", 0.2, 1, 2, 5], ["kristal", 0.12, 1, 1, 10], ["mithril", 0.06, 1, 1, 18]];
  const rows = [];
  for (const [id, ch, lo, hi, minLv] of table) if (r.lvl >= minLv && Math.random() < ch) { const n = randomInt(lo, hi); addItem(r, id, n); rows.push(itemRow(id, n)); }
  if (Math.random() < 0.15) { const dmg = randomInt(5, 15); r.hp = Math.max(1, r.hp - dmg); rows.push({ icon: "heart", text: tl("rpgl.24", { dmg }), sub: tl("rpgl.25") }); }
  rows.push(...xpRows(r, randomInt(8, 20)));
  return { title: tl("rpgl.26"), subtitle: tl("rpgl.27"), badge: tl("rpgl.28"), accent: "0x6fd7ff", rows, ok: true };
};

export const fish = (r) => {
  r.stamina -= 6; track(r, "fish");
  const roll = Math.random(), rows = [];
  const id = roll < 0.05 && r.lvl >= 8 ? "ikanlangka" : roll < 0.2 && r.lvl >= 3 ? "tuna" : roll < 0.5 ? "ikanmas" : "ikankecil";
  const n = randomInt(1, 2); addItem(r, id, n); rows.push(itemRow(id, n));
  if (Math.random() < 0.03) { addItem(r, "petikayu", 1); rows.push(itemRow("petikayu", 1)); }
  rows.push(...xpRows(r, randomInt(5, 12)));
  return { title: tl("rpgl.29"), subtitle: tl("rpgl.30"), badge: tl("rpgl.31"), accent: "0x6fd7ff", rows, ok: true };
};

/* ── hadiah harian / mingguan / pendaftaran ──────────────────────────────── */
export const claimDaily = (r) => {
  const today = dayOf(Date.now());
  if (r.daily.last === today) return null;
  const yesterday = dayOf(Date.now() - 86_400_000);
  r.daily.streak = r.daily.last === yesterday ? r.daily.streak + 1 : 1; r.daily.last = today;
  const gold = 200 + Math.min(r.daily.streak, 14) * 50; r.gold += gold; addItem(r, "potionhp", 2);
  const rows = [goldRow(gold), itemRow("potionhp", 2)];
  if (r.daily.streak % 7 === 0) { addItem(r, "petiemas", 1); rows.push(itemRow("petiemas", 1)); }
  return { title: tl("rpgl.32"), subtitle: tl("rpgl.35", { streak: r.daily.streak, v: r.daily.streak % 7 ? tl("rpgl.33", { v: Math.ceil(r.daily.streak / 7) * 7 }) : tl("rpgl.34") }), badge: tl("rpgl.36", { streak: r.daily.streak }), accent: "0xffd566", rows, ok: true };
};
export const WEEK = 7 * 86_400_000;
export const claimWeekly = (r) => {
  if (Date.now() - (r.weekly ?? 0) < WEEK) return null;
  r.weekly = Date.now(); r.gold += 2000; r.diamond += 5; addItem(r, "petiemas", 1); addItem(r, "potionbesar", 3);
  return { title: tl("rpgl.37"), subtitle: tl("rpgl.38"), badge: tl("rpgl.39"), accent: "0xffd566", rows: [goldRow(2000), diamondRow(5), itemRow("petiemas", 1), itemRow("potionbesar", 3)], ok: true };
};
export const registerGift = (r) => {
  if (r.gift) return [];
  r.gift = true; r.gold += 500; addItem(r, "potionhp", 3); addItem(r, "petikayu", 1);
  return [goldRow(500), itemRow("potionhp", 3), itemRow("petikayu", 1)];
};

export const topPlayers = (n = 10) =>
  Object.entries(db.users).filter(([, u]) => u.rpg && u.reg?.on).map(([jid, u]) => ({ jid, name: u.reg.name, lvl: u.rpg.lvl, xp: u.rpg.xp, gold: u.rpg.gold }))
    .sort((a, b) => b.lvl - a.lvl || b.xp - a.xp).slice(0, n);

/* ── misi harian ─────────────────────────────────────────────────────────── */
export const QUESTS = [
  { key: "kill", goal: 5, name: "Kalahkan 5 monster", icon: "sword" },
  { key: "mine", goal: 3, name: "Menambang 3 kali", icon: "ore" },
  { key: "fish", goal: 3, name: "Memancing 3 kali", icon: "fish" },
];
QUESTS.forEach(lexName);
export const questState = (r) => {
  const today = dayOf(Date.now());
  if (r.q.day !== today) r.q = { day: today, kill: 0, mine: 0, fish: 0, claimed: false };
  return r.q;
};
export function track(r, key, n = 1) { r.q ??= { day: "", kill: 0, mine: 0, fish: 0, claimed: false }; questState(r)[key] += n; }
export const questDone = (r) => QUESTS.every((q) => questState(r)[q.key] >= q.goal);
export const questRows = (r) => QUESTS.map((q) => { const v = Math.min(questState(r)[q.key], q.goal); return { icon: q.icon, text: `${q.name}${v >= q.goal ? tl("rpgl.40") : ""}`, sub: tl("rpgl.41", { v, goal: q.goal }) }; });
export const claimQuests = (r) => {
  const q = questState(r);
  if (q.claimed || !questDone(r)) return null;
  q.claimed = true; r.gold += 500; r.diamond += 1; addItem(r, "petikayu", 1);
  return [goldRow(500), diamondRow(1), itemRow("petikayu", 1)];
};

/* ── kerja, duel, rampok (cooldown) ──────────────────────────────────────── */
export const cooldownLeft = (r, key, ms) => Math.max(0, (r.cd[key] ?? 0) + ms - Date.now());
export const startCooldown = (r, key) => { r.cd[key] = Date.now(); };
export const CD = { kerja: 20 * 60_000, duel: 5 * 60_000, rampok: 60 * 60_000, balap: 5 * 60_000, ojol: 2 * 60_000, gocar: 4 * 60_000, gofood: 3 * 60_000 };

const JOBS = ["Kurir Guild", "Penjaga Toko", "Koki Kedai", "Pemburu Upahan", "Penjaga Gerbang", "Penyihir Magang", "Nelayan Pelabuhan"];
export const work = (r) => {
  startCooldown(r, "kerja");
  const job = lex(pick(JOBS)), gold = 150 + r.lvl * 20 + randomInt(0, 200);
  r.gold += gold;
  return { title: tl("rpgl.42"), subtitle: tl("rpgl.43", { job }), badge: tl("rpgl.44"), accent: "0xffd566", rows: [goldRow(gold), ...xpRows(r, randomInt(10, 25))], ok: true };
};

const duelSim = (a, b) => {
  const sa = statsOf(a), sb = statsOf(b);
  let ha = sa.maxHp, hb = sb.maxHp, turn = Math.random() < 0.5 ? 0 : 1, rounds = 0;
  while (ha > 0 && hb > 0 && rounds < 120) {
    rounds++;
    const [at, df] = turn ? [sb, sa] : [sa, sb];
    let dmg = Math.max(1, Math.round(at.atk * (0.85 + Math.random() * 0.3) - df.def * 0.5));
    if (Math.random() < 0.1) dmg = Math.round(dmg * 1.8);
    if (turn) ha -= dmg; else hb -= dmg;
    turn ^= 1;
  }
  return { aWins: hb <= 0, rounds };
};
// Duel PvP: a menantang b. Taruhan diambil dari dompet yang kalah.
export const duel = (a, b, bet, nameB) => {
  startCooldown(a, "duel");
  const res = duelSim(a, b), stake = Math.min(bet, a.gold, b.gold);
  const [win, lose] = res.aWins ? [a, b] : [b, a];
  lose.gold -= stake; win.gold += stake;
  win.pvp.duelWin++; lose.pvp.duelLose++;
  const rows = [{ icon: "sword", text: res.aWins ? tl("rpgl.45", { nameB }) : tl("rpgl.46", { nameB }), sub: tl("rpgl.47", { rounds: res.rounds }) }];
  if (stake) rows.push(res.aWins ? goldRow(stake) : { icon: "coin", text: tl("rpgl.48", { stake }), sub: tl("rpgl.49") });
  if (res.aWins) rows.push(...xpRows(a, 30 + b.lvl * 5));
  return { title: tl("rpgl.50"), subtitle: tl("rpgl.51", { nameB }), badge: res.aWins ? tl("rpgl.52") : tl("rpgl.53"), accent: res.aWins ? "0x6fdc8c" : "0xff8a9a", rows, ok: res.aWins };
};

// Rampok dompet (uang di BANK aman).
export const rob = (a, b, nameB) => {
  startCooldown(a, "rampok");
  const chance = Math.min(0.7, Math.max(0.2, 0.45 + (a.lvl - b.lvl) * 0.02));
  if (Math.random() < chance) {
    const take = Math.max(1, Math.min(Math.round(b.gold * (0.1 + Math.random() * 0.1)), 5000));
    b.gold -= take; a.gold += take;
    return { title: tl("rpgl.54"), subtitle: tl("rpgl.55", { nameB }), badge: tl("rpgl.56"), accent: "0x6fdc8c", rows: [goldRow(take), { icon: "bag", text: tl("rpgl.57"), sub: tl("rpgl.58") }], ok: true };
  }
  const fine = Math.min(a.gold, Math.min(500, Math.round(a.gold * 0.1))); a.gold -= fine; b.gold += fine;
  return { title: tl("rpgl.59"), subtitle: tl("rpgl.60", { nameB }), badge: tl("rpgl.61"), accent: "0xff8a9a", rows: [{ icon: "coin", text: tl("rpgl.62", { fine }), sub: tl("rpgl.63", { nameB }) }], ok: false };
};

/* ── ojol / gocar / gofood ───────────────────────────────────────────────── */
// Tiap pesanan: rating acak 1–5 menentukan bayaran; ada tip, bonus streak bintang 5, dan hadiah kelipatan pesanan.
// routes = jumlah rute (teksnya di config/lang: route.<jenis>.<n>).
export const TRIPS = {
  ojol: { title: "OJOL", name: "Ojol", cost: 8, minLv: 1, base: [60, 140], per: 6, xp: [10, 22], accent: "0x6fdc8c", routes: 6, drop: ["energi", 0.06, 1, 1] },
  gocar: { title: "GOCAR", name: "GoCar", cost: 14, minLv: 3, base: [150, 320], per: 10, xp: [18, 36], accent: "0x5aa9ff", routes: 5, drop: ["petikayu", 0.05, 1, 1] },
  gofood: { title: "GOFOOD", name: "GoFood", cost: 10, minLv: 2, base: [100, 220], per: 8, xp: [14, 30], accent: "0xffd566", routes: 7, drop: ["potionhp", 0.18, 1, 2] },
};
const STAR_MULT = { 1: 0.5, 2: 0.7, 3: 0.9, 4: 1.1, 5: 1.3 };
const rollStar = () => { const x = Math.random(); return x < 0.03 ? 1 : x < 0.1 ? 2 : x < 0.25 ? 3 : x < 0.55 ? 4 : 5; };

export const trip = (r, kind) => {
  const spec = TRIPS[kind];
  r.stamina -= spec.cost; startCooldown(r, kind);
  const route = t(`route.${kind}.${randomInt(0, spec.routes - 1)}`);
  const event = Math.random();
  const rows = [];

  if (event < 0.06) {
    const comp = randomInt(15, 40); r.gold += comp; r.drv.star5 = 0;
    rows.push(goldRow(comp), { icon: "bag", text: t("trip.cancelled"), sub: t("trip.cancelledSub") });
    rows.push(...xpRows(r, randomInt(2, 6)));
    return { title: spec.title, subtitle: t("trip.cancelSub", { route }), badge: t("trip.cancelBadge"), accent: "0xff8a9a", rows, ok: false, stars: 0 };
  }

  const stars = rollStar();
  let gold = Math.round((randomInt(...spec.base) + r.lvl * spec.per) * STAR_MULT[stars]);
  if (event < 0.16) { gold = Math.round(gold * 0.8); rows.push({ icon: "heart", text: t("trip.jam"), sub: t("trip.jamSub") }); }
  r.gold += gold; rows.unshift(goldRow(gold));
  r.drv[kind]++; r.drv.total++;

  if (stars >= 4 && Math.random() < 0.3) { const tip = randomInt(20, 120); r.gold += tip; rows.push({ icon: "coin", text: t("trip.tip", { n: tip }), sub: t("trip.tipSub") }); }
  if (Math.random() < 0.04) { r.diamond += 1; rows.push(diamondRow(1)); }
  const [dropId, chance, lo, hi] = spec.drop;
  if (Math.random() < chance) { const n = randomInt(lo, hi); addItem(r, dropId, n); rows.push(itemRow(dropId, n)); }

  r.drv.star5 = stars === 5 ? r.drv.star5 + 1 : 0;
  if (stars === 5 && r.drv.star5 % 5 === 0) { r.gold += 300; rows.push({ icon: "star", text: t("trip.streak"), sub: t("trip.streakSub", { n: r.drv.star5 }) }); }
  if (r.drv.total % 50 === 0) { addItem(r, "petiemas", 1); r.diamond += 3; rows.push(itemRow("petiemas", 1), diamondRow(3)); }
  else if (r.drv.total % 10 === 0) { addItem(r, "petikayu", 1); rows.push({ ...itemRow("petikayu", 1), sub: t("trip.milestone", { n: r.drv.total }) }); }

  rows.push(...xpRows(r, randomInt(...spec.xp)));
  return { title: spec.title, subtitle: t("trip.subtitle", { route, n: stars }), badge: `${stars}/5`, accent: stars >= 4 ? spec.accent : "0xffc857", rows, ok: true, stars };
};

/* ── balap & suit PvP (pakai tag) ────────────────────────────────────────── */
// Balap ojol: a menantang b. Kecepatan = level + keberuntungan. Taruhan diambil dari dompet yang kalah.
export const race = (a, b, bet, nameB) => {
  startCooldown(a, "balap");
  const sa = a.lvl * 2 + randomInt(1, 100), sb = b.lvl * 2 + randomInt(1, 100);
  const aWins = sa === sb ? Math.random() < 0.5 : sa > sb, stake = Math.min(bet, a.gold, b.gold);
  const [win, lose] = aWins ? [a, b] : [b, a];
  lose.gold -= stake; win.gold += stake; win.pvp.raceWin++; lose.pvp.raceLose++;
  const rows = [{ icon: "sword", text: aWins ? t("race.rowWin", { name: nameB }) : t("race.rowLose", { name: nameB }), sub: t("race.speed", { a: sa, b: sb }) }];
  if (stake) rows.push(aWins ? goldRow(stake) : { icon: "coin", text: t("race.lost", { n: stake }), sub: t("race.lostSub") });
  if (aWins) rows.push(...xpRows(a, 20 + b.lvl * 3));
  return { title: t("race.title"), subtitle: t("race.sub", { name: nameB }), badge: aWins ? t("res.win") : t("res.lose"), accent: aWins ? "0x6fdc8c" : "0xff8a9a", rows, ok: aWins };
};

// Hadiah catur: menang +250 Gold & 60 XP, remis +50 Gold & 20 XP (diberikan plugin catur bila permainan cukup panjang).
export const chessReward = (r, win) => {
  const gold = win ? 250 : 50, xp = win ? 60 : 20;
  r.gold += gold; xpRows(r, xp);
  const item = win && Math.random() < 0.4 ? "petikayu" : null; // bonus peti untuk pemenang
  if (item) addItem(r, item, 1);
  return { gold, xp, item };
};

export const SUIT = {
  batu: { icon: "✊", get name() { return t("suit.batu"); }, beats: "gunting" },
  gunting: { icon: "✌️", get name() { return t("suit.gunting"); }, beats: "kertas" },
  kertas: { icon: "✋", get name() { return t("suit.kertas"); }, beats: "batu" },
};
const SUIT_WORDS = { batu: "batu", rock: "batu", "✊": "batu", gunting: "gunting", scissors: "gunting", "✌️": "gunting", "✌": "gunting", kertas: "kertas", paper: "kertas", "✋": "kertas" };
export const parseSuit = (text) => SUIT_WORDS[String(text ?? "").trim().toLowerCase().replace(/[.!\s]+$/g, "")] ?? null;
// 0 = seri, 1 = x menang, 2 = y menang
export const suitWinner = (x, y) => (x === y ? 0 : SUIT[x].beats === y ? 1 : 2);

// Hadiah suit: pemenang dapat taruhan (dari dompet yang kalah) + bonus 100 Gold + XP; yang kalah dapat sedikit XP hiburan.
export const suitSettle = (win, lose, bet) => {
  const stake = Math.min(bet, win.gold, lose.gold), bonus = 100 + win.lvl * 5;
  lose.gold -= stake; win.gold += stake + bonus;
  win.pvp.suitWin++; lose.pvp.suitLose++;
  return {
    stake, bonus,
    winRows: [...(stake ? [goldRow(stake)] : []), { icon: "coin", text: t("suit.bonus", { n: bonus }), sub: t("suit.bonusSub") }, ...xpRows(win, 25 + lose.lvl * 3)],
    loseRows: [...(stake ? [{ icon: "coin", text: t("suit.lost", { n: stake }), sub: t("suit.lostSub") }] : []), ...xpRows(lose, 10)],
  };
};

/* ── leaderboard (banyak kategori) ───────────────────────────────────────── */
const nf = (n) => Number(n ?? 0).toLocaleString(localeOf());
const rp = (u) => u.rpg;
// Setiap papan: label & teks tampilan diambil dari config/lang (lb.<kunci>.label / .main / .sub).
const board = (key, icon, aliases, score, vars) => ({
  icon, aliases, score,
  get label() { return t(`lb.${key}.label`); },
  show: (u) => { const v = vars(u); return [t(`lb.${key}.main`, v), t(`lb.${key}.sub`, v)]; },
});
export const LEADERBOARDS = {
  petualang: board("petualang", "star", ["rpg", "hero", "petualangan", "adventurer"], (u) => (rp(u) ? rp(u).lvl * 1e9 + rp(u).xp : null), (u) => ({ lvl: rp(u).lvl, xp: nf(rp(u).xp) })),
  uang: board("uang", "coin", ["money", "duit", "kaya", "harta", "wealth"], (u) => (rp(u) ? rp(u).gold + (rp(u).bank ?? 0) : null), (u) => ({ n: nf(rp(u).gold + (rp(u).bank ?? 0)) })),
  gold: board("gold", "coin", ["dompet", "koin", "wallet"], (u) => (rp(u) ? rp(u).gold : null), (u) => ({ n: nf(rp(u).gold) })),
  bank: board("bank", "bag", ["tabungan", "atm", "savings"], (u) => (rp(u) ? rp(u).bank ?? 0 : null), (u) => ({ n: nf(rp(u).bank ?? 0) })),
  berlian: board("berlian", "gem", ["diamond", "diamonds", "gem"], (u) => (rp(u) ? rp(u).diamond : null), (u) => ({ n: nf(rp(u).diamond) })),
  limit: board("limit", "potion", ["limitku"], (u) => u.limit ?? 0, (u) => ({ n: nf(u.limit), l: u.level ?? 1 })),
  level: board("level", "star", ["lvl", "exp"], (u) => (u.level ?? 1) * 1e9 + (u.exp ?? 0), (u) => ({ l: u.level ?? 1, exp: nf(u.exp) })),
  kill: board("kill", "sword", ["monster", "bunuh", "kills"], (u) => (rp(u) ? rp(u).kills : null), (u) => ({ n: nf(rp(u).kills) })),
  dungeon: board("dungeon", "shield", ["dg", "ekspedisi", "dungeons"], (u) => (rp(u) ? rp(u).dungeons : null), (u) => ({ n: nf(rp(u).dungeons) })),
  orderan: board("orderan", "heart", ["order", "orders", "ojol", "gocar", "gofood", "driver"], (u) => (rp(u) ? rp(u).drv?.total ?? 0 : null), (u) => ({ n: nf(rp(u).drv?.total ?? 0) })),
  duel: board("duel", "sword", ["pvp"], (u) => (rp(u) ? rp(u).pvp?.duelWin ?? 0 : null), (u) => ({ n: nf(rp(u).pvp?.duelWin ?? 0) })),
  suit: board("suit", "fang", ["suitpvp"], (u) => (rp(u) ? rp(u).pvp?.suitWin ?? 0 : null), (u) => ({ n: nf(rp(u).pvp?.suitWin ?? 0) })),
  chess: board("chess", "shield", ["catur"], (u) => (u.chess ? u.chess.win : null), (u) => ({ n: nf(u.chess.win), d: nf(u.chess.draw), l: nf(u.chess.loss) })),
  dino: board("dino", "leaf", ["dinorunner", "hyrox"], (u) => u.games?.dino?.best || null, (u) => ({ n: nf(u.games.dino.best) })),
  abyss: board("abyss", "sword", ["miyakoabyss", "menara"], (u) => (u.games?.abyss?.best ? Math.floor(u.games.abyss.best / 10) : null), (u) => ({ n: u.games.abyss.best >= 100 ? 10 : Math.floor(u.games.abyss.best / 10), w: nf(u.games.abyss.won ?? 0) })),
  catursolo: board("catursolo", "shield", ["chessai", "vsai", "caturai"], (u) => (u.chessAi && Object.keys(u.chessAi.cleared ?? {}).length ? Math.max(...Object.keys(u.chessAi.cleared).map(Number)) : null), (u) => ({ n: Math.max(...Object.keys(u.chessAi.cleared).map(Number)), w: nf(u.chessAi.win) })),
  g2048: board("g2048", "gem", ["2048"], (u) => u.games?.["2048"]?.best || null, (u) => ({ n: nf(u.games["2048"].best) })),
  balap: board("balap", "leaf", ["race"], (u) => (rp(u) ? rp(u).pvp?.raceWin ?? 0 : null), (u) => ({ n: nf(rp(u).pvp?.raceWin ?? 0) })),
};
export const resolveBoard = (query) => {
  const k = slugify(query ?? "") || "petualang";
  return LEADERBOARDS[k] ? k : Object.keys(LEADERBOARDS).find((id) => LEADERBOARDS[id].aliases.includes(k)) ?? null;
};
// → { top: [{ jid, name, score, main, sub, rank }], total, me: { rank, main } | null }
export const boardOf = (key, meJid, n = 10) => {
  const b = LEADERBOARDS[key];
  const all = Object.entries(db.users)
    .filter(([, u]) => u.reg?.on)
    .map(([jid, u]) => ({ jid, name: u.reg.name ?? u.name ?? jid.split("@")[0], score: b.score(u), u }))
    .filter((x) => x.score !== null && x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x, i) => { const [main, sub] = b.show(x.u); return { jid: x.jid, name: x.name, score: x.score, main, sub, rank: i + 1 }; });
  const me = all.find((x) => x.jid === meJid);
  return { top: all.slice(0, n), total: all.length, me: me ? { rank: me.rank, main: me.main } : null };
};

/* ── ATM / bank ──────────────────────────────────────────────────────────── */
export const bankCap = (r) => 10_000 + r.lvl * 10_000;
export const interestPerDay = (r) => Math.min(5000, Math.floor(r.bank * 0.01)); // 1% per hari (maks 5.000)
// Bunga masuk otomatis tiap 24 jam (maks 7 hari tertumpuk).
export const accrue = (r) => {
  const day = 86_400_000, now = Date.now();
  if (!r.bankAt) { r.bankAt = now; return 0; }
  const days = Math.min(7, Math.floor((now - r.bankAt) / day));
  if (days <= 0) return 0;
  let gain = 0;
  for (let i = 0; i < days; i++) gain += interestPerDay({ bank: r.bank + gain });
  gain = Math.min(gain, Math.max(0, bankCap(r) - r.bank));
  r.bank += gain; r.bankAt = (now - r.bankAt) / day > 7 ? now : r.bankAt + days * day;
  return gain;
};
export const deposit = (r, n) => { const amt = Math.max(0, Math.min(n, r.gold, bankCap(r) - r.bank)); r.gold -= amt; r.bank += amt; return amt; };
export const withdraw = (r, n) => { const amt = Math.max(0, Math.min(n, r.bank)); r.bank -= amt; r.gold += amt; return amt; };

/* ── Kartu ATM: PIN + sesi ───────────────────────────────────────────────── */
// ATM wajib dibeli dulu (.buy atm). Buka ATM: .atm <SN> <PIN> → sesi 10 menit untuk deposit / tarik / transfer.
export const hasAtm = (r) => count(r, "atm") > 0;
const PIN_RE = /^\d{4,6}$/;
export const validPin = (pin) => PIN_RE.test(String(pin ?? ""));
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString("hex");
export const hasPin = (r) => Boolean(r.pin?.hash);
export const setPin = (r, pin) => {
  const salt = crypto.randomBytes(12).toString("hex");
  r.pin = { salt, hash: hashPin(pin, salt) };
  r.pinFail = { n: 0, until: 0 };
};
export const checkPin = (r, pin) => {
  if (!hasPin(r)) return false;
  const a = Buffer.from(hashPin(pin, r.pin.salt), "hex"), b = Buffer.from(r.pin.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
// Salah PIN 5× → ATM terkunci 10 menit. Mengembalikan menit sisa (0 = tidak terkunci).
export const pinLockedMinutes = (r) => Math.max(0, Math.ceil(((r.pinFail?.until ?? 0) - Date.now()) / 60_000));
export const pinFailed = (r) => {
  r.pinFail ??= { n: 0, until: 0 };
  r.pinFail.n += 1;
  if (r.pinFail.n >= 5) { r.pinFail = { n: 0, until: Date.now() + 10 * 60_000 }; return 0; }
  return 5 - r.pinFail.n;
};
export const pinOk = (r) => { r.pinFail = { n: 0, until: 0 }; };
const ATM_SESSION = 10 * 60_000;
const atmOpen = new Map(); // jid → ms habis
export const openAtm = (jid) => atmOpen.set(jid, Date.now() + ATM_SESSION);
export const atmIsOpen = (jid) => (atmOpen.get(jid) ?? 0) > Date.now();

// "1000", "1.5k", "2m", "all"
export const parseAmount = (text, max) => {
  const t = String(text ?? "").toLowerCase().replace(/,/g, ".").trim();
  if (/^(all|semua|habis)$/.test(t)) return max;
  const m = t.match(/^(\d+(?:\.\d+)?)([km]?)$/);
  return m ? Math.floor(Number(m[1]) * ({ k: 1e3, m: 1e6 }[m[2]] ?? 1)) : 0;
};
