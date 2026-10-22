import { config } from "#lib/config";
import { db } from "#lib/database";
import * as game from "#lib/rpg";
import { fmt, tr } from "#lib/tr";
import { numberOf, randomInt } from "#lib/utils";

/*
 * 🎰 CASINO — mesin permainan judi (Gold virtual, bukan uang sungguhan). Semua taruhan diambil dari DOMPET (r.gold), pembayaran masuk dompet.
 *   Solo (lawan bandar): slot · roulette · dadu · koin · blackjack · hi-lo · baccarat · wheel
 *   Antar pemain      : duel dadu · duel koin · duel kartu tertinggi (taruhan sama, pemenang ambil pot − biaya 3%)
 *   Beramai-ramai     : jackpot (kumpul pot di grup, 1 pemenang acak berbobot taruhan, biaya 5%)
 * RTP (peluang kembali) dibuat 92–98% sehingga bandar sedikit unggul — diverifikasi lewat simulasi Monte-Carlo (lihat catatan di README).
 */
export const MIN_BET = 100;
export const MAX_BET = 500_000;
export const FEE_PVP = 0.03;
export const FEE_POT = 0.05;
export const POT_MS = 60_000;
export const POT_MAX_PLAYERS = 20;
const now = () => Date.now();
const mem = (globalThis.__miyakoCasino ??= { bj: new Map(), hilo: new Map(), duels: new Map(), cd: new Map() });
export const state = mem;

/* ── taruhan & statistik ─────────────────────────────────────────────────── */
// "500" · "1k" · "2,5k" · "1jt" · "all" · "half" → angka atau null
export const parseBet = (raw, wallet) => {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/^(all|semua|max)$/.test(s)) return Math.min(wallet, MAX_BET);
  if (/^(half|setengah)$/.test(s)) return Math.min(Math.floor(wallet / 2), MAX_BET);
  const m = s.match(/^(\d+(?:[.,]\d+)?)(k|rb|m|jt)?$/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  const mult = { k: 1_000, rb: 1_000, m: 1_000_000, jt: 1_000_000 }[m[2]] ?? 1;
  return Math.floor(n * mult);
};
export const checkBet = (r, bet) => {
  if (!Number.isFinite(bet) || bet < MIN_BET) return { error: "min", min: MIN_BET };
  if (bet > MAX_BET) return { error: "max", max: MAX_BET };
  if (r.gold < bet) return { error: "gold" };
  return { ok: true };
};
export const stat = (user) => (user.casino ??= { net: 0, plays: 0, won: 0, lost: 0, best: 0 });
// Catat hasil satu putaran: net = pembayaran − taruhan (negatif = rugi)
export const record = (user, bet, payout) => {
  const s = stat(user), net = payout - bet;
  s.plays++; s.net += net;
  if (net > 0) { s.won++; s.best = Math.max(s.best, net); } else if (net < 0) s.lost++;
  db.save("users");
  return net;
};
// Anti-spam: jeda minimal antar putaran
export const throttle = (jid, ms = 1500) => {
  const wait = (mem.cd.get(jid) ?? 0) + ms - now();
  if (wait > 0) return wait;
  mem.cd.set(jid, now());
  return 0;
};

const wr = (list) => { const total = list.reduce((s, x) => s + x[1], 0); let n = Math.random() * total; for (const [v, w] of list) { n -= w; if (n < 0) return v; } return list.at(-1)[0]; };

/* ── 🎰 slot ─────────────────────────────────────────────────────────────── */
export const SLOT_REELS = [["🍒", 30], ["🍋", 24], ["🍉", 18], ["🔔", 12], ["⭐", 8], ["💎", 5], ["7️⃣", 3]];
export const SLOT_PAY3 = { "🍒": 6, "🍋": 10, "🍉": 18, "🔔": 35, "⭐": 75, "💎": 200, "7️⃣": 1000 }; // total kembali (× taruhan)
export const SLOT_TWO = 2; // dua 🍒 mana pun
export const spinSlot = () => {
  const reels = [wr(SLOT_REELS), wr(SLOT_REELS), wr(SLOT_REELS)];
  let mult = 0;
  if (reels[0] === reels[1] && reels[1] === reels[2]) mult = SLOT_PAY3[reels[0]];
  else if (reels.filter((x) => x === "🍒").length === 2) mult = SLOT_TWO;
  return { reels, mult };
};
export const slotRtp = () => {
  const total = SLOT_REELS.reduce((s, x) => s + x[1], 0);
  let ev = 0;
  for (const [a, wa] of SLOT_REELS) for (const [b, wb] of SLOT_REELS) for (const [c, wc] of SLOT_REELS) {
    const p = (wa / total) * (wb / total) * (wc / total);
    const reels = [a, b, c];
    const mult = a === b && b === c ? SLOT_PAY3[a] : reels.filter((x) => x === "🍒").length === 2 ? SLOT_TWO : 0;
    ev += p * mult;
  }
  return ev;
};

/* ── 🎡 roulette (Eropa, 1 nol) ──────────────────────────────────────────── */
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const rouletteColor = (n) => (n === 0 ? "🟢" : REDS.has(n) ? "🔴" : "⚫");
const PICKS = [
  [/^(red|merah)$/, "red", (n) => REDS.has(n), 2], [/^(black|hitam)$/, "black", (n) => n > 0 && !REDS.has(n), 2],
  [/^(odd|ganjil)$/, "odd", (n) => n > 0 && n % 2 === 1, 2], [/^(even|genap)$/, "even", (n) => n > 0 && n % 2 === 0, 2],
  [/^(low|rendah)$/, "low", (n) => n >= 1 && n <= 18, 2], [/^(high|tinggi)$/, "high", (n) => n >= 19, 2],
  [/^(d1|dozen1|1st)$/, "d1", (n) => n >= 1 && n <= 12, 3], [/^(d2|dozen2|2nd)$/, "d2", (n) => n >= 13 && n <= 24, 3], [/^(d3|dozen3|3rd)$/, "d3", (n) => n >= 25, 3],
];
export const parseRoulette = (raw) => {
  const s = String(raw ?? "").toLowerCase().trim();
  for (const [re, key, test, ret] of PICKS) if (re.test(s)) return { key, test, ret };
  if (/^\d{1,2}$/.test(s) && Number(s) >= 0 && Number(s) <= 36) { const k = Number(s); return { key: String(k), test: (n) => n === k, ret: 36 }; }
  return null;
};
export const spinRoulette = (pick) => { const n = randomInt(0, 36); return { n, color: rouletteColor(n), win: pick.test(n), mult: pick.test(n) ? pick.ret : 0 }; };

/* ── 🎲 dadu (2 dadu) ────────────────────────────────────────────────────── */
export const DICE_FACE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
export const DICE_PAY = { big: 2.25, small: 2.25, seven: 5.6, number: 3 }; // kembali ×taruhan bila menang
export const parseDice = (raw) => {
  const s = String(raw ?? "").toLowerCase().trim();
  if (/^(big|besar|high|tinggi)$/.test(s)) return { key: "big", test: (a, b) => a + b >= 8, mult: DICE_PAY.big };
  if (/^(small|kecil|low|rendah)$/.test(s)) return { key: "small", test: (a, b) => a + b <= 6, mult: DICE_PAY.small };
  if (/^(seven|tujuh|7)$/.test(s)) return { key: "seven", test: (a, b) => a + b === 7, mult: DICE_PAY.seven };
  if (/^[1-6]$/.test(s)) { const k = Number(s); return { key: s, test: (a, b) => a === k || b === k, mult: DICE_PAY.number }; }
  return null;
};
export const rollDice = () => [randomInt(1, 6), randomInt(1, 6)];

/* ── 🪙 koin ─────────────────────────────────────────────────────────────── */
export const COIN_PAY = 1.95;
export const parseCoin = (raw) => { const s = String(raw ?? "").toLowerCase(); if (/^(head|heads|h|kepala|gambar)$/.test(s)) return "head"; if (/^(tail|tails|t|ekor|angka)$/.test(s)) return "tail"; return null; };
export const flipCoin = () => (Math.random() < 0.5 ? "head" : "tail");

/* ── 🎡 wheel ────────────────────────────────────────────────────────────── */
export const WHEEL = [[0, 10], [0.5, 5], [1, 3], [2, 3], [3, 2], [5, 1]];
export const WHEEL_ICON = { 0: "💀", 0.5: "🟠", 1: "🟡", 2: "🟢", 3: "🔵", 5: "💎" };
export const spinWheel = () => wr(WHEEL);

/* ── kartu ───────────────────────────────────────────────────────────────── */
export const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const drawCard = () => ({ r: randomInt(1, 13), s: randomInt(0, 3) });
export const cardText = (c) => `${RANKS[c.r]}${SUITS[c.s]}`;

/* ── 🃏 blackjack ────────────────────────────────────────────────────────── */
export const handValue = (hand) => {
  let total = hand.reduce((s, c) => s + (c.r >= 10 ? 10 : c.r === 1 ? 11 : c.r), 0), aces = hand.filter((c) => c.r === 1).length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
};
export const isBlackjack = (hand) => hand.length === 2 && handValue(hand).total === 21;
export const bjStart = (bet) => {
  const g = { bet, player: [drawCard(), drawCard()], dealer: [drawCard(), drawCard()], doubled: false, done: false, at: now() };
  if (isBlackjack(g.player) || isBlackjack(g.dealer)) g.done = true;
  return g;
};
export const bjHit = (g) => { g.player.push(drawCard()); g.at = now(); if (handValue(g.player).total >= 21) g.done = true; return g; };
export const bjStand = (g) => { g.done = true; return g; };
export const bjDouble = (g) => { g.doubled = true; g.player.push(drawCard()); g.done = true; return g; };
// Bandar main (berhenti di 17, termasuk soft 17), lalu hitung hasil → { outcome, payout (total kembali), net }
export const bjSettle = (g) => {
  const stake = g.bet * (g.doubled ? 2 : 1);
  const pv = handValue(g.player).total;
  const pbj = isBlackjack(g.player), dbj = isBlackjack(g.dealer);
  if (pbj || dbj) {
    if (pbj && dbj) return { outcome: "push", payout: stake };
    return pbj ? { outcome: "blackjack", payout: Math.floor(stake * 2.5) } : { outcome: "lose", payout: 0 };
  }
  if (pv > 21) return { outcome: "bust", payout: 0 };
  while (handValue(g.dealer).total < 17) g.dealer.push(drawCard());
  const dv = handValue(g.dealer).total;
  if (dv > 21 || pv > dv) return { outcome: "win", payout: stake * 2 };
  if (pv === dv) return { outcome: "push", payout: stake };
  return { outcome: "lose", payout: 0 };
};

/* ── ⬆️ hi-lo ────────────────────────────────────────────────────────────── */
export const HILO_EDGE = 0.98, HILO_CAP = 100;
export const hiloStart = (bet) => ({ bet, card: randomInt(1, 13), mult: 1, streak: 0, at: now() });
export const hiloOdds = (card) => ({ higher: (13 - card) / 13, lower: (card - 1) / 13 });
// guess "higher" | "lower" → { error } | { next, win, mult }
export const hiloGuess = (g, dir) => {
  const p = hiloOdds(g.card)[dir];
  if (!(p > 0)) return { error: "impossible" };
  const next = randomInt(1, 13);
  const win = dir === "higher" ? next > g.card : next < g.card;
  g.at = now();
  const prev = g.card;
  g.card = next;
  if (win) { g.mult = Math.min(HILO_CAP, g.mult * (HILO_EDGE / p)); g.streak++; }
  return { prev, next, win, mult: g.mult, capped: g.mult >= HILO_CAP };
};

/* ── 🎴 baccarat ─────────────────────────────────────────────────────────── */
const bacVal = (c) => (c.r >= 10 ? 0 : c.r);
const bacTotal = (hand) => hand.reduce((s, c) => s + bacVal(c), 0) % 10;
export const BAC_PAY = { player: 2, banker: 1.95, tie: 9 };
export const dealBaccarat = () => {
  const p = [drawCard(), drawCard()], b = [drawCard(), drawCard()];
  let pt = bacTotal(p), bt = bacTotal(b), p3 = null;
  if (pt < 8 && bt < 8) {
    if (pt <= 5) { p3 = drawCard(); p.push(p3); pt = bacTotal(p); }
    const v = p3 ? bacVal(p3) : null;
    const draw = v === null ? bt <= 5 : bt <= 2 || (bt === 3 && v !== 8) || (bt === 4 && v >= 2 && v <= 7) || (bt === 5 && v >= 4 && v <= 7) || (bt === 6 && (v === 6 || v === 7));
    if (draw) { b.push(drawCard()); bt = bacTotal(b); }
  }
  return { player: p, banker: b, pt, bt, outcome: pt > bt ? "player" : bt > pt ? "banker" : "tie" };
};
export const baccaratPayout = (pick, outcome, bet) => (outcome === pick ? Math.floor(bet * BAC_PAY[pick]) : outcome === "tie" ? bet : 0); // tie: taruhan player/banker dikembalikan

/* ── 🆚 duel antar pemain ────────────────────────────────────────────────── */
export const duelRoll = () => { let a, b; do { a = rollDice(); b = rollDice(); } while (a[0] + a[1] === b[0] + b[1]); return { a, b, winner: a[0] + a[1] > b[0] + b[1] ? 0 : 1 }; };
export const duelCoin = () => ({ winner: Math.random() < 0.5 ? 0 : 1 });
export const duelCard = () => {
  let a, b;
  do { a = drawCard(); b = drawCard(); } while (a.r === b.r && a.s === b.s);
  const rank = (c) => (c.r === 1 ? 14 : c.r);
  const winner = rank(a) !== rank(b) ? (rank(a) > rank(b) ? 0 : 1) : (a.s < b.s ? 0 : 1); // ♠️ > ♥️ > ♦️ > ♣️ bila angka sama
  return { a, b, winner };
};
export const duelPayout = (bet) => Math.floor(bet * 2 * (1 - FEE_PVP));

/* ── 💰 jackpot (pot grup, tersimpan di db.settings.pots) ────────────────── */
const pots = () => (db.settings.pots ??= {});
export const potOf = (chat) => pots()[chat] ?? null;
export const joinPot = (chat, jid, name, r, bet) => {
  let pot = potOf(chat);
  if (pot && pot.end <= now()) return { error: "closing" };
  const chk = checkBet(r, bet);
  if (chk.error) return chk;
  if (!pot) pot = pots()[chat] = { chat, start: now(), end: now() + POT_MS, entries: {}, total: 0 };
  if (!pot.entries[jid] && Object.keys(pot.entries).length >= POT_MAX_PLAYERS) return { error: "full" };
  r.gold -= bet;
  const e = (pot.entries[jid] ??= { name, bet: 0 });
  e.name = name; e.bet += bet; pot.total += bet;
  db.save("settings"); db.save("users");
  return { ok: true, pot, fresh: Object.keys(pot.entries).length === 1 && e.bet === bet };
};
export const potChance = (pot, jid) => (pot.entries[jid] ? pot.entries[jid].bet / pot.total : 0);
// Undi pemenang (bobot taruhan). 1 peserta → dikembalikan.
export const drawPot = (pot) => {
  delete pots()[pot.chat];
  const list = Object.entries(pot.entries);
  if (list.length < 2) {
    for (const [jid, e] of list) { const u = db.users[jid]; if (u) { game.getRpg(u).gold += e.bet; record(u, e.bet, e.bet); } }
    db.save("settings"); db.save("users");
    return { chat: pot.chat, refunded: true, text: tr("💰 *JACKPOT* dibatalkan — hanya 1 peserta, taruhan dikembalikan.", "💰 *JACKPOT* cancelled — only 1 player, bets refunded."), mentions: list.map(([j]) => j) };
  }
  let n = Math.random() * pot.total, winner = list.at(-1)[0];
  for (const [jid, e] of list) { n -= e.bet; if (n < 0) { winner = jid; break; } }
  const prize = Math.floor(pot.total * (1 - FEE_POT));
  for (const [jid, e] of list) {
    const u = db.users[jid];
    if (!u) continue;
    if (jid === winner) { game.getRpg(u).gold += prize; record(u, e.bet, prize); } else record(u, e.bet, 0);
  }
  db.save("settings"); db.save("users");
  const w = pot.entries[winner];
  const lines = [tr("💰 *JACKPOT!*", "💰 *JACKPOT!*"), `🏆 @${numberOf(winner)} ${tr("menang", "wins")} *${fmt(prize)}* Gold! (${Math.round((w.bet / pot.total) * 100)}% ${tr("peluang", "chance")})`, `👥 ${list.length} ${tr("pemain", "players")} · 💵 ${tr("pot", "pot")} ${fmt(pot.total)} · ${tr("biaya", "fee")} ${FEE_POT * 100}%`, "", ...list.map(([j, e]) => `• @${numberOf(j)} — ${fmt(e.bet)}`)];
  return { chat: pot.chat, winner, prize, text: lines.join("\n"), mentions: list.map(([j]) => j) };
};
export const settlePots = () => Object.values(pots()).filter((p) => p.end <= now()).map(drawPot);

// Permainan interaktif yang ditinggalkan (> 5 menit): blackjack = stand otomatis, hi-lo = cash-out otomatis
export const IDLE_MS = 5 * 60_000;
export const settleIdle = () => {
  const out = [];
  for (const [jid, g] of mem.bj) {
    if (g.at + IDLE_MS > now()) continue;
    mem.bj.delete(jid);
    const u = db.users[jid];
    if (!u) continue;
    bjStand(g);
    const res = bjSettle(g);
    game.getRpg(u).gold += res.payout; record(u, g.bet * (g.doubled ? 2 : 1), res.payout);
    out.push({ chat: g.chat, mentions: [jid], text: tr(`⌛ Blackjack @${numberOf(jid)} ditinggalkan — otomatis *stand*: ${res.outcome} (${fmt(res.payout)} Gold).`, `⌛ @${numberOf(jid)}'s blackjack hand was abandoned — auto *stand*: ${res.outcome} (${fmt(res.payout)} Gold).`) });
  }
  for (const [jid, g] of mem.hilo) {
    if (g.at + IDLE_MS > now()) continue;
    mem.hilo.delete(jid);
    const u = db.users[jid];
    if (!u) continue;
    const payout = Math.floor(g.bet * g.mult);
    game.getRpg(u).gold += payout; record(u, g.bet, payout);
    out.push({ chat: g.chat, mentions: [jid], text: tr(`⌛ Hi-Lo @${numberOf(jid)} ditinggalkan — otomatis *cash out*: ${fmt(payout)} Gold.`, `⌛ @${numberOf(jid)}'s Hi-Lo game was abandoned — auto *cash out*: ${fmt(payout)} Gold.`) });
  }
  return out;
};
void config;
