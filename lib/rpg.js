import crypto from "node:crypto";
import { db } from "#lib/database";
import { config } from "#lib/config";
import { pick, randomInt, slugify } from "#lib/utils";

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

export const TYPE_LABEL = { weapon: "Senjata", armor: "Zirah", potion: "Ramuan", material: "Bahan", fish: "Ikan", crate: "Peti", tool: "Kartu" };

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
export const titleOf = (lvl) => (lvl < 5 ? "Petualang Pemula" : lvl < 10 ? "Petualang" : lvl < 20 ? "Ksatria" : lvl < 30 ? "Pahlawan" : "Legenda");
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
export const goldRow = (n) => ({ icon: "coin", text: `+${n.toLocaleString("id-ID")} Gold`, sub: "Uang" });
export const diamondRow = (n) => ({ icon: "gem", text: `+${n} Berlian`, sub: "Mata uang premium" });
export const xpRows = (r, xp) => {
  const rows = [{ icon: "star", text: `+${xp} XP`, sub: "Pengalaman" }];
  for (const up of addXp(r, xp)) rows.push({ icon: "star", text: `LEVEL UP! Lv ${up.lvl}`, sub: `Bonus +${up.bonus} Gold · HP pulih penuh` });
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
const need = (r, cost) => (r.stamina < cost ? `⚡ Stamina kurang (${r.stamina}/${cost}). Tunggu pulih atau pakai *minuman energi*.` : null);
const lowHp = (r) => (r.hp < statsOf(r).maxHp * 0.15 ? "❤️ HP terlalu rendah! Pulihkan dulu dengan *.pakai potionhp* (atau tunggu pulih sendiri)." : null);
export const preflight = (r, cost, needsHp = true) => need(r, cost) ?? (needsHp ? lowHp(r) : null);

export const hunt = (r) => {
  r.stamina -= 10;
  const mon = pick(eligible(r.lvl)), st = statsOf(r), res = fight(st, mon, r.hp);
  r.hp = Math.max(1, res.hp);
  if (!res.win) {
    const lost = Math.min(r.gold, Math.round(r.gold * 0.05));
    r.gold -= lost; r.hp = Math.max(1, Math.round(st.maxHp * 0.1));
    return { title: "BERBURU", subtitle: `Kalah melawan ${mon.name}`, badge: "KALAH", accent: "0xff8a9a", rows: [{ icon: "heart", text: "Kamu tumbang!", sub: `${res.rounds} ronde · HP tersisa sedikit` }, ...(lost ? [{ icon: "coin", text: `Kehilangan ${lost} Gold`, sub: "Ongkos berobat" }] : [])], ok: false };
  }
  r.kills++; track(r, "kill");
  const gold = randomInt(...mon.gold); r.gold += gold;
  const rows = [goldRow(gold), ...rollDrops(r, mon.drops), ...xpRows(r, mon.xp)];
  return { title: "BERBURU", subtitle: `Mengalahkan ${mon.name} · ${res.rounds} ronde`, badge: "MENANG", accent: "0x6fdc8c", rows, ok: true };
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
      return { title: "DUNGEON", subtitle: `Gugur di tangan ${foe.name} (${beaten.length}/4)`, badge: "GAGAL", accent: "0xff8a9a", rows: [{ icon: "heart", text: "Ekspedisi gagal", sub: beaten.length ? `Menang atas: ${beaten.join(", ")}` : "Belum ada musuh yang dikalahkan" }, ...(lost ? [{ icon: "coin", text: `Kehilangan ${lost} Gold`, sub: "Biaya penyelamatan" }] : [])], ok: false };
    }
    beaten.push(foe.name); xp += foe.xp; const g = randomInt(...foe.gold); gold += g; r.kills++; track(r, "kill");
    loot.push(...foe.drops);
  }
  r.hp = Math.max(1, hp); r.gold += gold; r.dungeons++;
  const rows = [goldRow(gold), ...rollDrops(r, loot), ...xpRows(r, xp)];
  return { title: "DUNGEON", subtitle: `Bersih! Boss ${boss.name} tumbang`, badge: "SELESAI", accent: "0xffd566", rows, ok: true };
};

export const mine = (r) => {
  r.stamina -= 8; track(r, "mine");
  const table = [["batu", 1, 1, 3, 1], ["besi", 0.45, 1, 2, 1], ["emas", 0.2, 1, 2, 5], ["kristal", 0.12, 1, 1, 10], ["mithril", 0.06, 1, 1, 18]];
  const rows = [];
  for (const [id, ch, lo, hi, minLv] of table) if (r.lvl >= minLv && Math.random() < ch) { const n = randomInt(lo, hi); addItem(r, id, n); rows.push(itemRow(id, n)); }
  if (Math.random() < 0.15) { const dmg = randomInt(5, 15); r.hp = Math.max(1, r.hp - dmg); rows.push({ icon: "heart", text: `Terluka ${dmg} HP`, sub: "Terkena runtuhan batu" }); }
  rows.push(...xpRows(r, randomInt(8, 20)));
  return { title: "MENAMBANG", subtitle: "Hasil galian di tambang", badge: "SELESAI", accent: "0x6fd7ff", rows, ok: true };
};

export const fish = (r) => {
  r.stamina -= 6; track(r, "fish");
  const roll = Math.random(), rows = [];
  const id = roll < 0.05 && r.lvl >= 8 ? "ikanlangka" : roll < 0.2 && r.lvl >= 3 ? "tuna" : roll < 0.5 ? "ikanmas" : "ikankecil";
  const n = randomInt(1, 2); addItem(r, id, n); rows.push(itemRow(id, n));
  if (Math.random() < 0.03) { addItem(r, "petikayu", 1); rows.push(itemRow("petikayu", 1)); }
  rows.push(...xpRows(r, randomInt(5, 12)));
  return { title: "MEMANCING", subtitle: "Tangkapan hari ini", badge: "SELESAI", accent: "0x6fd7ff", rows, ok: true };
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
  return { title: "HADIAH HARIAN", subtitle: `Streak ${r.daily.streak} hari${r.daily.streak % 7 ? ` · bonus peti di hari ke-${Math.ceil(r.daily.streak / 7) * 7}` : " · BONUS PETI!"}`, badge: `DAY ${r.daily.streak}`, accent: "0xffd566", rows, ok: true };
};
export const WEEK = 7 * 86_400_000;
export const claimWeekly = (r) => {
  if (Date.now() - (r.weekly ?? 0) < WEEK) return null;
  r.weekly = Date.now(); r.gold += 2000; r.diamond += 5; addItem(r, "petiemas", 1); addItem(r, "potionbesar", 3);
  return { title: "HADIAH MINGGUAN", subtitle: "Bisa diklaim lagi 7 hari lagi", badge: "MINGGUAN", accent: "0xffd566", rows: [goldRow(2000), diamondRow(5), itemRow("petiemas", 1), itemRow("potionbesar", 3)], ok: true };
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
export const questState = (r) => {
  const today = dayOf(Date.now());
  if (r.q.day !== today) r.q = { day: today, kill: 0, mine: 0, fish: 0, claimed: false };
  return r.q;
};
export function track(r, key, n = 1) { r.q ??= { day: "", kill: 0, mine: 0, fish: 0, claimed: false }; questState(r)[key] += n; }
export const questDone = (r) => QUESTS.every((q) => questState(r)[q.key] >= q.goal);
export const questRows = (r) => QUESTS.map((q) => { const v = Math.min(questState(r)[q.key], q.goal); return { icon: q.icon, text: `${q.name}${v >= q.goal ? "  (selesai)" : ""}`, sub: `Progres ${v}/${q.goal}` }; });
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
  const job = pick(JOBS), gold = 150 + r.lvl * 20 + randomInt(0, 200);
  r.gold += gold;
  return { title: "BEKERJA", subtitle: `Kerja sebagai ${job}`, badge: "GAJIAN", accent: "0xffd566", rows: [goldRow(gold), ...xpRows(r, randomInt(10, 25))], ok: true };
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
  const rows = [{ icon: "sword", text: res.aWins ? `Kamu mengalahkan ${nameB}` : `${nameB} mengalahkanmu`, sub: `${res.rounds} ronde` }];
  if (stake) rows.push(res.aWins ? goldRow(stake) : { icon: "coin", text: `Kehilangan ${stake} Gold`, sub: "Taruhan duel" });
  if (res.aWins) rows.push(...xpRows(a, 30 + b.lvl * 5));
  return { title: "DUEL", subtitle: `Kamu vs ${nameB}`, badge: res.aWins ? "MENANG" : "KALAH", accent: res.aWins ? "0x6fdc8c" : "0xff8a9a", rows, ok: res.aWins };
};

// Rampok dompet (uang di BANK aman).
export const rob = (a, b, nameB) => {
  startCooldown(a, "rampok");
  const chance = Math.min(0.7, Math.max(0.2, 0.45 + (a.lvl - b.lvl) * 0.02));
  if (Math.random() < chance) {
    const take = Math.max(1, Math.min(Math.round(b.gold * (0.1 + Math.random() * 0.1)), 5000));
    b.gold -= take; a.gold += take;
    return { title: "RAMPOK", subtitle: `Berhasil merampok ${nameB}`, badge: "BERHASIL", accent: "0x6fdc8c", rows: [goldRow(take), { icon: "bag", text: "Kabur tanpa ketahuan", sub: "Simpan uangmu di ATM agar aman" }], ok: true };
  }
  const fine = Math.min(a.gold, Math.min(500, Math.round(a.gold * 0.1))); a.gold -= fine; b.gold += fine;
  return { title: "RAMPOK", subtitle: `Ketahuan oleh ${nameB}`, badge: "GAGAL", accent: "0xff8a9a", rows: [{ icon: "coin", text: `Denda ${fine} Gold`, sub: `Diberikan ke ${nameB}` }], ok: false };
};

/* ── ojol / gocar / gofood ───────────────────────────────────────────────── */
// Tiap pesanan: rating acak 1–5 menentukan bayaran; ada tip, bonus streak bintang 5, dan hadiah kelipatan pesanan.
export const TRIPS = {
  ojol: {
    title: "OJOL", name: "Ojol", cost: 8, minLv: 1, base: [60, 140], per: 6, xp: [10, 22], accent: "0x6fdc8c",
    routes: ["Stasiun → Kampus", "Mall → Perumahan Griya", "Pasar → Terminal", "Kantor → Kosan", "Bandara → Alun-alun", "Sekolah → Rumah Sakit"],
    drop: ["energi", 0.06, 1, 1],
  },
  gocar: {
    title: "GOCAR", name: "GoCar", cost: 14, minLv: 3, base: [150, 320], per: 10, xp: [18, 36], accent: "0x5aa9ff",
    routes: ["Bandara → Hotel Bintang 5", "Stasiun Kota → Kawasan Industri", "Perumahan → Bandara", "Pelabuhan → Pusat Kota", "Hotel → Gedung Konser"],
    drop: ["petikayu", 0.05, 1, 1],
  },
  gofood: {
    title: "GOFOOD", name: "GoFood", cost: 10, minLv: 2, base: [100, 220], per: 8, xp: [14, 30], accent: "0xffd566",
    routes: ["Nasi Goreng Gerobak", "Ayam Geprek Level 5", "Bakso Mang Ujang", "Seblak Komplit", "Kopi Susu Gula Aren", "Mie Ayam Pangsit", "Sate Taichan"],
    drop: ["potionhp", 0.18, 1, 2],
  },
};
const STAR_MULT = { 1: 0.5, 2: 0.7, 3: 0.9, 4: 1.1, 5: 1.3 };
const STAR_NOTE = { 1: "Pelanggan kecewa", 2: "Kurang memuaskan", 3: "Lumayan", 4: "Pelayanan bagus", 5: "Sempurna! Bintang lima" };
const rollStar = () => { const x = Math.random(); return x < 0.03 ? 1 : x < 0.1 ? 2 : x < 0.25 ? 3 : x < 0.55 ? 4 : 5; };

export const trip = (r, kind) => {
  const t = TRIPS[kind];
  r.stamina -= t.cost; startCooldown(r, kind);
  const route = pick(t.routes);
  const event = Math.random();
  const rows = [];

  if (event < 0.06) {
    const comp = randomInt(15, 40); r.gold += comp; r.drv.star5 = 0;
    rows.push(goldRow(comp), { icon: "bag", text: "Pesanan dibatalkan pelanggan", sub: "Dapat uang kompensasi" });
    rows.push(...xpRows(r, randomInt(2, 6)));
    return { title: t.title, subtitle: `${route} · Dibatalkan`, badge: "BATAL", accent: "0xff8a9a", rows, ok: false, stars: 0 };
  }

  const stars = rollStar();
  let gold = Math.round((randomInt(...t.base) + r.lvl * t.per) * STAR_MULT[stars]);
  if (event < 0.16) { gold = Math.round(gold * 0.8); rows.push({ icon: "heart", text: "Terjebak macet / hujan deras", sub: "Bayaran berkurang 20%" }); }
  r.gold += gold; rows.unshift(goldRow(gold));
  r.drv[kind]++; r.drv.total++;

  if (stars >= 4 && Math.random() < 0.3) { const tip = randomInt(20, 120); r.gold += tip; rows.push({ icon: "coin", text: `+${tip} Gold Tip`, sub: "Pelanggan puas" }); }
  if (Math.random() < 0.04) { r.diamond += 1; rows.push(diamondRow(1)); }
  const [dropId, chance, lo, hi] = t.drop;
  if (Math.random() < chance) { const n = randomInt(lo, hi); addItem(r, dropId, n); rows.push(itemRow(dropId, n)); }

  r.drv.star5 = stars === 5 ? r.drv.star5 + 1 : 0;
  if (stars === 5 && r.drv.star5 % 5 === 0) { r.gold += 300; rows.push({ icon: "star", text: "+300 Gold Bonus Streak", sub: `${r.drv.star5}x bintang 5 berturut-turut` }); }
  if (r.drv.total % 50 === 0) { addItem(r, "petiemas", 1); r.diamond += 3; rows.push(itemRow("petiemas", 1), diamondRow(3)); }
  else if (r.drv.total % 10 === 0) { addItem(r, "petikayu", 1); rows.push({ ...itemRow("petikayu", 1), sub: `Bonus ${r.drv.total} pesanan` }); }

  rows.push(...xpRows(r, randomInt(...t.xp)));
  return { title: t.title, subtitle: `${route} · Rating ${stars}/5`, badge: `${stars}/5`, accent: stars >= 4 ? t.accent : "0xffc857", rows, ok: true, stars, note: STAR_NOTE[stars] };
};

/* ── balap & suit PvP (pakai tag) ────────────────────────────────────────── */
// Balap ojol: a menantang b. Kecepatan = level + keberuntungan. Taruhan diambil dari dompet yang kalah.
export const race = (a, b, bet, nameB) => {
  startCooldown(a, "balap");
  const sa = a.lvl * 2 + randomInt(1, 100), sb = b.lvl * 2 + randomInt(1, 100);
  const aWins = sa === sb ? Math.random() < 0.5 : sa > sb, stake = Math.min(bet, a.gold, b.gold);
  const [win, lose] = aWins ? [a, b] : [b, a];
  lose.gold -= stake; win.gold += stake; win.pvp.raceWin++; lose.pvp.raceLose++;
  const rows = [{ icon: "sword", text: aWins ? `Kamu finis duluan, ${nameB} kalah` : `${nameB} finis duluan`, sub: `Kecepatan ${sa} vs ${sb}` }];
  if (stake) rows.push(aWins ? goldRow(stake) : { icon: "coin", text: `Kehilangan ${stake} Gold`, sub: "Taruhan balap" });
  if (aWins) rows.push(...xpRows(a, 20 + b.lvl * 3));
  return { title: "BALAP OJOL", subtitle: `Kamu vs ${nameB}`, badge: aWins ? "MENANG" : "KALAH", accent: aWins ? "0x6fdc8c" : "0xff8a9a", rows, ok: aWins };
};

export const SUIT = {
  batu: { icon: "✊", name: "Batu", beats: "gunting" },
  gunting: { icon: "✌️", name: "Gunting", beats: "kertas" },
  kertas: { icon: "✋", name: "Kertas", beats: "batu" },
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
  return { stake, bonus, winRows: [...(stake ? [goldRow(stake)] : []), { icon: "coin", text: `+${bonus} Gold Bonus`, sub: "Hadiah kemenangan suit" }, ...xpRows(win, 25 + lose.lvl * 3)], loseRows: [...(stake ? [{ icon: "coin", text: `Kehilangan ${stake} Gold`, sub: "Taruhan suit" }] : []), ...xpRows(lose, 10)] };
};

/* ── leaderboard (banyak kategori) ───────────────────────────────────────── */
const nf = (n) => Number(n ?? 0).toLocaleString("id-ID");
const rp = (u) => u.rpg;
export const LEADERBOARDS = {
  petualang: { label: "Petualang", icon: "star", aliases: ["rpg", "hero", "petualangan"], score: (u) => (rp(u) ? rp(u).lvl * 1e9 + rp(u).xp : null), show: (u) => [`Lv ${rp(u).lvl}`, `${nf(rp(u).xp)} XP`] },
  uang: { label: "Uang (Dompet + Bank)", icon: "coin", aliases: ["money", "duit", "kaya", "harta"], score: (u) => (rp(u) ? rp(u).gold + (rp(u).bank ?? 0) : null), show: (u) => [`${nf(rp(u).gold + (rp(u).bank ?? 0))} G`, "Dompet + Bank"] },
  gold: { label: "Gold (Dompet)", icon: "coin", aliases: ["dompet", "koin"], score: (u) => (rp(u) ? rp(u).gold : null), show: (u) => [`${nf(rp(u).gold)} G`, "Dompet"] },
  bank: { label: "Saldo Bank", icon: "bag", aliases: ["tabungan", "atm"], score: (u) => (rp(u) ? rp(u).bank ?? 0 : null), show: (u) => [`${nf(rp(u).bank ?? 0)} G`, "Tabungan"] },
  berlian: { label: "Berlian", icon: "gem", aliases: ["diamond", "gem"], score: (u) => (rp(u) ? rp(u).diamond : null), show: (u) => [`${nf(rp(u).diamond)} Berlian`, "Mata uang premium"] },
  limit: { label: "Limit", icon: "potion", aliases: ["limitku"], score: (u) => u.limit ?? 0, show: (u) => [`${nf(u.limit)} Limit`, `Level ${u.level ?? 1}`] },
  level: { label: "Level Bot", icon: "star", aliases: ["lvl", "exp"], score: (u) => (u.level ?? 1) * 1e9 + (u.exp ?? 0), show: (u) => [`Level ${u.level ?? 1}`, `${nf(u.exp)} EXP`] },
  kill: { label: "Monster Dibunuh", icon: "sword", aliases: ["monster", "bunuh", "kills"], score: (u) => (rp(u) ? rp(u).kills : null), show: (u) => [`${nf(rp(u).kills)} Kill`, "Berburu & dungeon"] },
  dungeon: { label: "Dungeon Selesai", icon: "shield", aliases: ["dg", "ekspedisi"], score: (u) => (rp(u) ? rp(u).dungeons : null), show: (u) => [`${nf(rp(u).dungeons)} Dungeon`, "Boss tumbang"] },
  orderan: { label: "Orderan Driver", icon: "heart", aliases: ["order", "ojol", "gocar", "gofood", "driver"], score: (u) => (rp(u) ? rp(u).drv?.total ?? 0 : null), show: (u) => [`${nf(rp(u).drv?.total ?? 0)} Order`, "Ojol · GoCar · GoFood"] },
  duel: { label: "Menang Duel", icon: "sword", aliases: ["pvp"], score: (u) => (rp(u) ? rp(u).pvp?.duelWin ?? 0 : null), show: (u) => [`${nf(rp(u).pvp?.duelWin ?? 0)} Menang`, "Duel PvP"] },
  suit: { label: "Menang Suit", icon: "fang", aliases: ["suitpvp"], score: (u) => (rp(u) ? rp(u).pvp?.suitWin ?? 0 : null), show: (u) => [`${nf(rp(u).pvp?.suitWin ?? 0)} Menang`, "Suit PvP"] },
  balap: { label: "Menang Balap", icon: "leaf", aliases: ["race"], score: (u) => (rp(u) ? rp(u).pvp?.raceWin ?? 0 : null), show: (u) => [`${nf(rp(u).pvp?.raceWin ?? 0)} Menang`, "Balap Ojol"] },
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
