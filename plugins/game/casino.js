import { db } from "#lib/database";
import * as K from "#lib/casino";
import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { rememberSock } from "#lib/sched";
import { fmt, tr } from "#lib/tr";
import { numberOf } from "#lib/utils";

/*
 * 🎰 CASINO (lib/casino.js) — 8 game solo + 3 game antar pemain + jackpot grup. Semua pakai Gold dompet; bukan uang sungguhan.
 *   Solo    : .slot · .roulette · .dadu · .coin · .bj (blackjack) · .hilo · .baccarat · .wheel
 *   Lawan   : .dadu @tag <bet> · .coin @tag <bet> · .highcard @tag <bet>   (lawan jawab y/gas atau n/gamau)
 *   Ramai   : .jackpot <bet>  (pot grup 60 detik, 1 pemenang acak berbobot taruhan)
 *   Info    : .casino · .casino stats [@tag] · .casino top
 */
const p0 = (env) => env.ctx.pfx;
const who = (ctx) => ctx.mentionedJid?.[0] ?? ctx.quotedSender ?? null;
const nameOf = (env) => env.user.reg?.name ?? env.ctx.pushName ?? numberOf(env.ctx.senderId);
const wallet = (r) => `💰 ${tr("Dompet", "Wallet")}: ${fmt(r.gold)} Gold`;
const sign = (n) => (n > 0 ? `+${fmt(n)}` : fmt(n));

const BET_ERR = {
  min: (e) => tr(`❌ Taruhan minimal ${fmt(e.min)} Gold.`, `❌ Minimum bet is ${fmt(e.min)} Gold.`),
  max: (e) => tr(`❌ Taruhan maksimal ${fmt(e.max)} Gold.`, `❌ Maximum bet is ${fmt(e.max)} Gold.`),
  gold: () => tr("💸 Gold di dompetmu tidak cukup. (Tarik dari bank: *.tarik*)", "💸 Not enough Gold in your wallet. (Withdraw from the bank: *.tarik*)"),
  closing: () => tr("⏳ Pot sedang diundi — tunggu putaran berikutnya.", "⏳ The pot is being drawn — wait for the next round."),
  full: () => tr(`👥 Pot penuh (${K.POT_MAX_PLAYERS} pemain).`, `👥 The pot is full (${K.POT_MAX_PLAYERS} players).`),
};
const betErr = (e) => (BET_ERR[e.error] ?? (() => `❌ ${e.error}`))(e);

// Ambil & validasi taruhan; menjawab sendiri bila gagal → { bet, r } | null
const takeBet = async (env, raw) => {
  const { ctx } = env, r = game.getRpg(env.user);
  const wait = K.throttle(ctx.senderId);
  if (wait) { await ctx.reply(tr("⏳ Pelan-pelan, tunggu sebentar.", "⏳ Easy there, wait a moment.")); return null; }
  const bet = K.parseBet(raw, r.gold);
  if (bet === null) { await ctx.reply(tr(`❓ Tulis jumlah taruhan: *${ctx.pfx}${ctx.command} <jumlah>* (contoh 500, 2k, 1jt, half, all)`, `❓ Enter a bet: *${ctx.pfx}${ctx.command} <amount>* (e.g. 500, 2k, 1m, half, all)`)); return null; }
  const chk = K.checkBet(r, bet);
  if (chk.error) { await ctx.reply(betErr(chk)); return null; }
  return { bet, r };
};
const resultLine = (net, bet, mult) => (net > 0 ? tr(`✅ MENANG ${sign(net)} Gold${mult ? ` (×${mult})` : ""}`, `✅ WIN ${sign(net)} Gold${mult ? ` (×${mult})` : ""}`) : net === 0 ? tr("🤝 Seri — taruhan kembali", "🤝 Push — bet returned") : tr(`❌ KALAH -${fmt(bet)} Gold`, `❌ LOST -${fmt(bet)} Gold`));
// bayar & catat satu putaran instan
const settle = (env, r, bet, payout) => { r.gold += payout; return K.record(env.user, bet, payout); };

/* ── 🎰 slot ─────────────────────────────────────────────────────────────── */
const slot = definePlugin({
  name: "slot", aliases: ["slots", "judi"], category: "game", access: { group: true },
  description: "Slot machine (777 = ×1000)", usage: "slot <bet>",
  async run(env) {
    const t = await takeBet(env, env.ctx.args[0]); if (!t) return;
    const { bet, r } = t; r.gold -= bet;
    const { reels, mult } = K.spinSlot(), payout = Math.floor(bet * mult), net = settle(env, r, bet, payout);
    const jack = mult >= 200;
    await env.ctx.reply([`🎰 *SLOT* — ${fmt(bet)} Gold`, `┏━━━━━━━━━┓\n┃ ${reels.join(" ┃ ")} ┃\n┗━━━━━━━━━┛`, jack ? `🎉 *JACKPOT!!* ×${mult}` : "", resultLine(net, bet, mult || null), wallet(r)].filter(Boolean).join("\n"));
  },
});

/* ── 🎡 roulette ─────────────────────────────────────────────────────────── */
const roulette = definePlugin({
  name: "roulette", aliases: ["rolet", "roul"], category: "game", access: { group: true },
  description: "Roulette: red/black, odd/even, low/high, dozens (d1-d3) or a number 0-36",
  usage: "roulette <bet> <red|black|odd|even|low|high|d1|d2|d3|0-36>",
  async run(env) {
    const { ctx } = env;
    const pick = K.parseRoulette(ctx.args[1]);
    if (!pick) return ctx.reply(tr(`🎡 *ROULETTE*\nPakai: *${ctx.pfx}roulette <bet> <pilihan>*\n› *red/merah · black/hitam* (×2)\n› *odd/ganjil · even/genap* (×2)\n› *low (1-18) · high (19-36)* (×2)\n› *d1 (1-12) · d2 (13-24) · d3 (25-36)* (×3)\n› *angka 0-36* (×36)`, `🎡 *ROULETTE*\nUse: *${ctx.pfx}roulette <bet> <pick>*\n› *red · black* (×2)\n› *odd · even* (×2)\n› *low (1-18) · high (19-36)* (×2)\n› *d1 (1-12) · d2 (13-24) · d3 (25-36)* (×3)\n› *number 0-36* (×36)`));
    const t = await takeBet(env, ctx.args[0]); if (!t) return;
    const { bet, r } = t; r.gold -= bet;
    const res = K.spinRoulette(pick), net = settle(env, r, bet, Math.floor(bet * res.mult));
    await ctx.reply([`🎡 *ROULETTE* — ${fmt(bet)} Gold ${tr("pada", "on")} *${pick.key}*`, `⚪ ${tr("Bola jatuh di", "The ball lands on")} ${res.color} *${res.n}*`, resultLine(net, bet, res.mult || null), wallet(r)].join("\n"));
  },
});

/* ── 🆚 duel (dadu / koin / kartu) — tantangan antar pemain ─────────────── */
const pending = K.state.duels;
const DUEL_MS = 60_000;
const DUEL_NAME = { dice: () => tr("Duel Dadu 🎲", "Dice Duel 🎲"), coin: () => tr("Duel Koin 🪙", "Coin Duel 🪙"), card: () => tr("Duel Kartu 🃏", "Card Duel 🃏") };
const challenge = async (env, kind, targetId, rawBet) => {
  const { ctx, sock } = env, me = ctx.senderId;
  if (!ctx.isGroup) return ctx.reply(tr("🆚 Duel dimainkan di grup.", "🆚 Duels are played in groups."));
  if (targetId === me) return ctx.reply(tr("😅 Tidak bisa melawan diri sendiri.", "😅 You can't challenge yourself."));
  const t = await takeBet(env, rawBet); if (!t) return;
  const key = `${ctx.chatId}|${targetId}`, old = pending.get(key);
  if (old && old.until > Date.now()) return ctx.reply(tr("⏳ Lawanmu masih punya tantangan lain yang menunggu.", "⏳ Your opponent already has a pending challenge."));
  pending.set(key, { kind, from: me, fromName: nameOf(env), to: targetId, bet: t.bet, until: Date.now() + DUEL_MS, sock, chat: ctx.chatId });
  await ctx.reply(tr(
    `🆚 *${DUEL_NAME[kind]()}*\n@${numberOf(me)} menantang @${numberOf(targetId)}!\n💵 Taruhan: *${fmt(t.bet)}* Gold masing-masing · pemenang bawa ${fmt(K.duelPayout(t.bet))} (biaya ${K.FEE_PVP * 100}%)\n\nJawab dalam ${DUEL_MS / 1000} detik:\n✅ *y* / *gas* / *oke* · ❌ *n* / *gamau*`,
    `🆚 *${DUEL_NAME[kind]()}*\n@${numberOf(me)} challenges @${numberOf(targetId)}!\n💵 Bet: *${fmt(t.bet)}* Gold each · winner takes ${fmt(K.duelPayout(t.bet))} (${K.FEE_PVP * 100}% fee)\n\nAnswer within ${DUEL_MS / 1000}s:\n✅ *y* / *gas* / *oke* · ❌ *n* / *gamau*`,
  ), { mentions: [me, targetId] });
  void sock;
};

const resolveDuel = async (env, ch) => {
  const { ctx } = env, a = db.users[ch.from], b = db.users[ch.to];
  if (!a || !b) return ctx.reply(tr("❌ Salah satu pemain belum terdaftar.", "❌ One of the players isn't registered."));
  const ra = game.getRpg(a), rb = game.getRpg(b);
  if (ra.gold < ch.bet || rb.gold < ch.bet) return ctx.reply(tr("💸 Gold di dompet salah satu pemain kurang — duel dibatalkan.", "💸 One player's wallet is short — duel cancelled."));
  ra.gold -= ch.bet; rb.gold -= ch.bet;
  let body, winner;
  if (ch.kind === "dice") { const d = K.duelRoll(); winner = d.winner; body = `🎲 @${numberOf(ch.from)}: ${K.DICE_FACE[d.a[0]]} ${K.DICE_FACE[d.a[1]]} = *${d.a[0] + d.a[1]}*\n🎲 @${numberOf(ch.to)}: ${K.DICE_FACE[d.b[0]]} ${K.DICE_FACE[d.b[1]]} = *${d.b[0] + d.b[1]}*`; }
  else if (ch.kind === "coin") { const c = K.duelCoin(); winner = c.winner; body = tr(`🪙 Koin dilempar… *${winner === 0 ? "kepala" : "ekor"}*! (@${numberOf(ch.from)} = kepala · @${numberOf(ch.to)} = ekor)`, `🪙 The coin spins… *${winner === 0 ? "heads" : "tails"}*! (@${numberOf(ch.from)} = heads · @${numberOf(ch.to)} = tails)`); }
  else { const c = K.duelCard(); winner = c.winner; body = `🃏 @${numberOf(ch.from)}: *${K.cardText(c.a)}*\n🃏 @${numberOf(ch.to)}: *${K.cardText(c.b)}*`; }
  const win = winner === 0 ? ch.from : ch.to, lose = winner === 0 ? ch.to : ch.from, prize = K.duelPayout(ch.bet);
  game.getRpg(db.users[win]).gold += prize;
  K.record(db.users[win], ch.bet, prize); K.record(db.users[lose], ch.bet, 0);
  await ctx.reply(`🆚 *${DUEL_NAME[ch.kind]()}* — ${fmt(ch.bet)} Gold\n${body}\n\n🏆 @${numberOf(win)} ${tr("menang", "wins")} *${fmt(prize)}* Gold!`, { mentions: [ch.from, ch.to] });
};

const duelPassive = async (env) => {
  const { ctx } = env;
  if (ctx.fromMe || ctx.isCmd || !ctx.isGroup || !ctx.text || ctx.text.length > 10) return false;
  const key = `${ctx.chatId}|${ctx.senderId}`, ch = pending.get(key);
  if (!ch) return false;
  if (ch.until < Date.now()) { pending.delete(key); return false; }
  const w = ctx.text.trim().toLowerCase().replace(/[.!?\s]+$/g, "");
  if (/^(y|gas|yes|oke)$/.test(w)) { pending.delete(key); await resolveDuel(env, ch); return true; }
  if (/^(n|gak|no|gamau)$/.test(w)) { pending.delete(key); await ctx.reply(tr(`❌ @${numberOf(ch.to)} menolak duel dari @${numberOf(ch.from)}.`, `❌ @${numberOf(ch.to)} declined @${numberOf(ch.from)}'s duel.`), { mentions: [ch.to, ch.from] }); return true; }
  return false;
};

/* ── 🎲 dadu ─────────────────────────────────────────────────────────────── */
const dadu = definePlugin({
  name: "dadu", aliases: ["dice", "sicbo"], category: "game", access: { group: true }, ownHelp: true,
  description: "Dice: bet big/small/seven/number vs the house, or duel a player with @tag",
  usage: "dadu <bet> <big|small|seven|1-6> · dadu @tag <bet>",
  async run(env) {
    const { ctx } = env, p = ctx.pfx, target = who(ctx);
    if (target) return challenge(env, "dice", target, ctx.args.find((a) => !a.startsWith("@")));
    const pick = K.parseDice(ctx.args[1]);
    if (!pick) return ctx.reply(tr(`🎲 *DADU* (2 dadu)\n› *${p}dadu <bet> big* — jumlah 8-12 (×${K.DICE_PAY.big})\n› *${p}dadu <bet> small* — jumlah 2-6 (×${K.DICE_PAY.small})\n› *${p}dadu <bet> seven* — jumlah 7 (×${K.DICE_PAY.seven})\n› *${p}dadu <bet> 1-6* — ada angka itu di salah satu dadu (×${K.DICE_PAY.number})\n› *${p}dadu @tag <bet>* — duel lawan pemain`, `🎲 *DICE* (2 dice)\n› *${p}dadu <bet> big* — total 8-12 (×${K.DICE_PAY.big})\n› *${p}dadu <bet> small* — total 2-6 (×${K.DICE_PAY.small})\n› *${p}dadu <bet> seven* — total 7 (×${K.DICE_PAY.seven})\n› *${p}dadu <bet> 1-6* — that number on either die (×${K.DICE_PAY.number})\n› *${p}dadu @tag <bet>* — duel a player`));
    const t = await takeBet(env, ctx.args[0]); if (!t) return;
    const { bet, r } = t; r.gold -= bet;
    const [a, b] = K.rollDice(), win = pick.test(a, b), net = settle(env, r, bet, win ? Math.floor(bet * pick.mult) : 0);
    await ctx.reply([`🎲 *DADU* — ${fmt(bet)} Gold ${tr("pada", "on")} *${pick.key}*`, `${K.DICE_FACE[a]} ${K.DICE_FACE[b]}  = *${a + b}*`, resultLine(net, bet, win ? pick.mult : null), wallet(r)].join("\n"));
  },
  passive: duelPassive,
});

/* ── 🪙 koin ─────────────────────────────────────────────────────────────── */
const coin = definePlugin({
  name: "coin", aliases: ["koin", "flip", "coinflip"], category: "game", access: { group: true }, ownHelp: true,
  description: "Coin flip: head/tail vs the house, or duel a player with @tag",
  usage: "coin <bet> <head|tail> · coin @tag <bet>",
  async run(env) {
    const { ctx } = env, p = ctx.pfx, target = who(ctx);
    if (target) return challenge(env, "coin", target, ctx.args.find((a) => !a.startsWith("@")));
    const side = K.parseCoin(ctx.args[1]);
    if (!side) return ctx.reply(tr(`🪙 *KOIN*\n› *${p}coin <bet> head|kepala* / *tail|ekor* (×${K.COIN_PAY})\n› *${p}coin @tag <bet>* — duel lawan pemain`, `🪙 *COIN*\n› *${p}coin <bet> head* / *tail* (×${K.COIN_PAY})\n› *${p}coin @tag <bet>* — duel a player`));
    const t = await takeBet(env, ctx.args[0]); if (!t) return;
    const { bet, r } = t; r.gold -= bet;
    const res = K.flipCoin(), win = res === side, net = settle(env, r, bet, win ? Math.floor(bet * K.COIN_PAY) : 0);
    await ctx.reply([`🪙 *KOIN* — ${fmt(bet)} Gold ${tr("pada", "on")} *${side}*`, tr(`Hasil: *${res === "head" ? "kepala 🙂" : "ekor 🔸"}*`, `Result: *${res === "head" ? "heads 🙂" : "tails 🔸"}*`), resultLine(net, bet, win ? K.COIN_PAY : null), wallet(r)].join("\n"));
  },
  passive: duelPassive,
});

/* ── 🃏 highcard (duel kartu) ────────────────────────────────────────────── */
const highcard = definePlugin({
  name: "highcard", aliases: ["kartu2", "hc"], category: "game", access: { group: true },
  description: "Card duel vs a player: highest card wins (A high; ♠ > ♥ > ♦ > ♣ breaks ties)", usage: "highcard @tag <bet>",
  async run(env) {
    const { ctx } = env, target = who(ctx);
    if (!target) return ctx.reply(tr(`🃏 *DUEL KARTU* — kartu tertinggi menang (A tertinggi; ♠️>♥️>♦️>♣️ bila sama)\nPakai: *${ctx.pfx}highcard @tag <bet>*`, `🃏 *CARD DUEL* — highest card wins (A high; ♠️>♥️>♦️>♣️ breaks ties)\nUse: *${ctx.pfx}highcard @tag <bet>*`));
    return challenge(env, "card", target, ctx.args.find((a) => !a.startsWith("@")));
  },
  passive: duelPassive,
});

/* ── 🃏 blackjack ────────────────────────────────────────────────────────── */
const bjText = (g, hideDealer) => {
  const pv = K.handValue(g.player).total;
  const dealer = hideDealer ? `${K.cardText(g.dealer[0])} 🂠` : g.dealer.map(K.cardText).join(" ");
  return `🧑 ${tr("Kamu", "You")}: ${g.player.map(K.cardText).join(" ")} = *${pv}*\n🏦 ${tr("Bandar", "Dealer")}: ${dealer}${hideDealer ? "" : ` = *${K.handValue(g.dealer).total}*`}`;
};
const bjFinish = async (env, g) => {
  const { ctx } = env, r = game.getRpg(env.user), res = K.bjSettle(g), stake = g.bet * (g.doubled ? 2 : 1);
  K.state.bj.delete(ctx.senderId);
  const net = settle(env, r, stake, res.payout);
  const title = { blackjack: tr("🃏 BLACKJACK! (×2.5)", "🃏 BLACKJACK! (×2.5)"), win: tr("✅ Kamu menang", "✅ You win"), bust: tr("💥 BUST — kartu melewati 21", "💥 BUST — over 21"), lose: tr("❌ Bandar menang", "❌ Dealer wins"), push: tr("🤝 Seri", "🤝 Push") }[res.outcome];
  await ctx.reply([`🃏 *BLACKJACK*${g.doubled ? " (double)" : ""} — ${fmt(stake)} Gold`, bjText(g, false), title, resultLine(net, stake, null), wallet(r)].join("\n"));
};
const bjAct = async (env, act) => {
  const { ctx } = env, g = K.state.bj.get(ctx.senderId), r = game.getRpg(env.user);
  if (!g) return ctx.reply(tr(`🃏 Kamu tidak sedang main. Mulai: *${ctx.pfx}bj <bet>*`, `🃏 You aren't in a hand. Start: *${ctx.pfx}bj <bet>*`));
  if (act === "double") {
    if (g.player.length !== 2) return ctx.reply(tr("❌ Double hanya di dua kartu pertama.", "❌ You can only double on your first two cards."));
    if (r.gold < g.bet) return ctx.reply(betErr({ error: "gold" }));
    r.gold -= g.bet; K.bjDouble(g);
  } else if (act === "hit") K.bjHit(g);
  else K.bjStand(g);
  if (g.done) return bjFinish(env, g);
  return ctx.reply(`🃏 *BLACKJACK* — ${fmt(g.bet)} Gold\n${bjText(g, true)}\n\n➡️ *hit* · *stand*${g.player.length === 2 ? " · *double*" : ""}`);
};
const bj = definePlugin({
  name: "bj", aliases: ["blackjack", "21"], category: "game", access: { group: true }, ownHelp: true,
  description: "Blackjack vs the dealer (hit / stand / double, blackjack pays 3:2)", usage: "bj <bet> · bj hit|stand|double",
  async run(env) {
    const { ctx } = env, me = ctx.senderId, a0 = (ctx.args[0] ?? "").toLowerCase();
    rememberSock(env.sock);
    if (["hit", "h", "stand", "s", "double", "d"].includes(a0)) return bjAct(env, a0.startsWith("h") ? "hit" : a0.startsWith("s") ? "stand" : "double");
    if (K.state.bj.has(me)) return ctx.reply(`🃏 ${tr("Kamu masih punya tangan berjalan:", "You still have a hand in play:")}\n${bjText(K.state.bj.get(me), true)}\n\n➡️ *hit* · *stand* · *double*`);
    if (!a0) return ctx.reply(tr(`🃏 *BLACKJACK*\nMulai: *${ctx.pfx}bj <bet>*\nLalu ketik *hit* (ambil), *stand* (cukup), *double* (taruhan ×2 + 1 kartu).\nBandar berhenti di 17 · blackjack bayar 3:2.`, `🃏 *BLACKJACK*\nStart: *${ctx.pfx}bj <bet>*\nThen type *hit*, *stand* or *double* (bet ×2 + 1 card).\nDealer stands on 17 · blackjack pays 3:2.`));
    const t = await takeBet(env, ctx.args[0]); if (!t) return;
    const { bet, r } = t; r.gold -= bet;
    const g = K.bjStart(bet); g.chat = ctx.chatId;
    K.state.bj.set(me, g);
    if (g.done) return bjFinish(env, g);
    return ctx.reply(`🃏 *BLACKJACK* — ${fmt(bet)} Gold\n${bjText(g, true)}\n\n➡️ *hit* · *stand* · *double*`);
  },
  async passive(env) {
    const { ctx } = env;
    if (ctx.fromMe || ctx.isCmd || !ctx.text || ctx.text.length > 8 || !K.state.bj.has(ctx.senderId)) return false;
    const w = ctx.text.trim().toLowerCase();
    if (w === "hit" || w === "stand" || w === "double") return bjAct(env, w);
    return false;
  },
});

/* ── ⬆️ hi-lo ────────────────────────────────────────────────────────────── */
const hiloText = (g) => {
  const o = K.hiloOdds(g.card), pr = (x) => (x > 0 ? `×${(K.HILO_EDGE / x).toFixed(2)}` : "—");
  return `🎴 ${tr("Kartu", "Card")}: *${K.cardText({ r: g.card, s: 0 }).replace("♠️", "")}* · 🔥 ${g.streak}× · 💰 ×${g.mult.toFixed(2)} = ${fmt(Math.floor(g.bet * g.mult))}\n⬆️ *higher* ${pr(o.higher)}  ·  ⬇️ *lower* ${pr(o.lower)}${g.streak ? `  ·  💵 *cash*` : ""}`;
};
const hiloCash = async (env, g, auto = false) => {
  const { ctx } = env, r = game.getRpg(env.user), payout = Math.floor(g.bet * g.mult);
  K.state.hilo.delete(ctx.senderId);
  const net = settle(env, r, g.bet, payout);
  await ctx.reply([`⬆️ *HI-LO* — ${auto ? tr("batas ×100 tercapai!", "×100 cap reached!") : tr("cash out", "cash out")}`, `💵 ${fmt(payout)} Gold (×${g.mult.toFixed(2)}, ${g.streak} ${tr("tebakan benar", "correct")})`, resultLine(net, g.bet, null), wallet(r)].join("\n"));
};
const hiloAct = async (env, act) => {
  const { ctx } = env, g = K.state.hilo.get(ctx.senderId), r = game.getRpg(env.user);
  if (!g) return ctx.reply(tr(`⬆️ Kamu tidak sedang main. Mulai: *${ctx.pfx}hilo <bet>*`, `⬆️ You aren't in a game. Start: *${ctx.pfx}hilo <bet>*`));
  if (act === "cash") return g.streak ? hiloCash(env, g) : ctx.reply(tr("❌ Tebak dulu minimal sekali sebelum cash out.", "❌ Make at least one correct guess before cashing out."));
  const res = K.hiloGuess(g, act);
  if (res.error) return ctx.reply(tr("❌ Mustahil — tidak ada kartu yang bisa lebih tinggi/rendah. Pilih arah lain.", "❌ Impossible — no card can be higher/lower. Pick the other direction."));
  const shown = `${K.cardText({ r: res.prev, s: 0 }).replace("♠️", "")} → *${K.cardText({ r: res.next, s: 0 }).replace("♠️", "")}*`;
  if (!res.win) {
    K.state.hilo.delete(ctx.senderId);
    const net = settle(env, r, g.bet, 0);
    return ctx.reply([`⬆️ *HI-LO* — ${shown}`, tr(`💥 Salah! (${res.next === res.prev ? "kartu sama = kalah" : act === "higher" ? "kartu lebih rendah" : "kartu lebih tinggi"})`, `💥 Wrong! (${res.next === res.prev ? "equal card loses" : act === "higher" ? "the card was lower" : "the card was higher"})`), resultLine(net, g.bet, null), wallet(r)].join("\n"));
  }
  if (res.capped) return hiloCash(env, g, true);
  return ctx.reply(`⬆️ *HI-LO* — ${shown} ✅\n${hiloText(g)}`);
};
const hilo = definePlugin({
  name: "hilo", aliases: ["highlow", "hl"], category: "game", access: { group: true }, ownHelp: true,
  description: "Hi-Lo: guess higher or lower, build a streak multiplier, cash out any time", usage: "hilo <bet> · hilo higher|lower|cash",
  async run(env) {
    const { ctx } = env, me = ctx.senderId, a0 = (ctx.args[0] ?? "").toLowerCase();
    rememberSock(env.sock);
    if (["higher", "high", "h", "up", "naik", "lower", "low", "l", "down", "turun", "cash", "cashout", "c"].includes(a0)) return hiloAct(env, /^(h|high|up|naik)/.test(a0) ? "higher" : /^(l|low|down|turun)/.test(a0) ? "lower" : "cash");
    if (K.state.hilo.has(me)) return ctx.reply(`⬆️ ${tr("Kamu masih punya game berjalan:", "You still have a game running:")}\n${hiloText(K.state.hilo.get(me))}`);
    if (!a0) return ctx.reply(tr(`⬆️ *HI-LO*\nMulai: *${ctx.pfx}hilo <bet>*, lalu tebak kartu berikutnya *higher* / *lower* (ketik langsung). Tiap tebakan benar menaikkan pengali; *cash* kapan saja. Kartu sama = kalah. Batas ×${K.HILO_CAP}.`, `⬆️ *HI-LO*\nStart: *${ctx.pfx}hilo <bet>*, then guess whether the next card is *higher* / *lower* (just type it). Each correct guess raises the multiplier; *cash* any time. Equal card loses. Cap ×${K.HILO_CAP}.`));
    const t = await takeBet(env, ctx.args[0]); if (!t) return;
    const { bet, r } = t; r.gold -= bet;
    const g = K.hiloStart(bet); g.chat = ctx.chatId;
    K.state.hilo.set(me, g);
    return ctx.reply(`⬆️ *HI-LO* — ${fmt(bet)} Gold\n${hiloText(g)}`);
  },
  async passive(env) {
    const { ctx } = env;
    if (ctx.fromMe || ctx.isCmd || !ctx.text || ctx.text.length > 9 || !K.state.hilo.has(ctx.senderId)) return false;
    const w = ctx.text.trim().toLowerCase();
    if (w === "higher" || w === "lower" || w === "cash") return hiloAct(env, w);
    return false;
  },
});

/* ── 🎴 baccarat ─────────────────────────────────────────────────────────── */
const baccarat = definePlugin({
  name: "baccarat", aliases: ["bacarat", "bac"], category: "game", access: { group: true },
  description: "Baccarat: bet player (×2), banker (×1.95) or tie (×9)", usage: "baccarat <bet> <player|banker|tie>",
  async run(env) {
    const { ctx } = env, pick = ({ player: "player", p: "player", banker: "banker", b: "banker", tie: "tie", t: "tie", seri: "tie" })[(ctx.args[1] ?? "").toLowerCase()];
    if (!pick) return ctx.reply(tr(`🎴 *BACCARAT*\nPakai: *${ctx.pfx}baccarat <bet> <player|banker|tie>*\n› player ×2 · banker ×1.95 · tie ×9\nTerdekat ke 9 menang. Seri mengembalikan taruhan player/banker.`, `🎴 *BACCARAT*\nUse: *${ctx.pfx}baccarat <bet> <player|banker|tie>*\n› player ×2 · banker ×1.95 · tie ×9\nClosest to 9 wins. A tie returns player/banker bets.`));
    const t = await takeBet(env, ctx.args[0]); if (!t) return;
    const { bet, r } = t; r.gold -= bet;
    const d = K.dealBaccarat(), payout = K.baccaratPayout(pick, d.outcome, bet), net = settle(env, r, bet, payout);
    await ctx.reply([`🎴 *BACCARAT* — ${fmt(bet)} Gold ${tr("pada", "on")} *${pick}*`, `👤 Player: ${d.player.map(K.cardText).join(" ")} = *${d.pt}*`, `🏦 Banker: ${d.banker.map(K.cardText).join(" ")} = *${d.bt}*`, `🏁 ${tr("Pemenang", "Result")}: *${d.outcome}*`, resultLine(net, bet, payout > bet ? (payout / bet).toFixed(2).replace(/\.?0+$/, "") : null), wallet(r)].join("\n"));
  },
});

/* ── 🎡 wheel of fortune ─────────────────────────────────────────────────── */
const wheel = definePlugin({
  name: "wheel", aliases: ["roda", "fortune"], category: "game", access: { group: true },
  description: "Wheel of fortune: ×0 to ×5", usage: "wheel <bet>",
  async run(env) {
    const t = await takeBet(env, env.ctx.args[0]); if (!t) return;
    const { bet, r } = t; r.gold -= bet;
    const mult = K.spinWheel(), net = settle(env, r, bet, Math.floor(bet * mult));
    const seg = K.WHEEL.map(([m]) => m).filter((v, i, a) => a.indexOf(v) === i).map((m) => `${K.WHEEL_ICON[m]}×${m}`).join(" ");
    await env.ctx.reply([`🎡 *WHEEL* — ${fmt(bet)} Gold`, `${K.WHEEL_ICON[mult]} ${tr("Berhenti di", "Stops at")} *×${mult}*`, `_${seg}_`, resultLine(net, bet, mult > 1 ? mult : null), wallet(r)].join("\n"));
  },
});

/* ── 💰 jackpot ──────────────────────────────────────────────────────────── */
const jackpot = definePlugin({
  name: "jackpot", aliases: ["pot", "lotre"], category: "game", access: { group: true }, ownHelp: true,
  description: "Group jackpot: everyone adds to the pot for 60s, one random winner (weighted by bet) takes it",
  usage: "jackpot <bet> · jackpot (see pot)",
  async run(env) {
    const { ctx } = env, chat = ctx.chatId, me = ctx.senderId, p = ctx.pfx;
    rememberSock(env.sock);
    for (const out of K.settlePots()) await env.sock.sendMessage(out.chat, { text: out.text, mentions: out.mentions }).catch(() => {});
    const show = (pot) => {
      const left = Math.max(0, Math.ceil((pot.end - Date.now()) / 1000));
      const rows = Object.entries(pot.entries).sort((a, b) => b[1].bet - a[1].bet).map(([j, e]) => `• @${numberOf(j)} — ${fmt(e.bet)} (${Math.round((e.bet / pot.total) * 100)}%)`);
      return { text: [`💰 *JACKPOT* — ${tr("pot", "pot")} *${fmt(pot.total)}* Gold`, `⏳ ${left}s · 👥 ${rows.length}`, ...rows, "", tr(`Ikut/tambah: *${p}jackpot <bet>* · pemenang dapat ${100 - K.FEE_POT * 100}%`, `Join/add: *${p}jackpot <bet>* · the winner gets ${100 - K.FEE_POT * 100}%`)].join("\n"), mentions: Object.keys(pot.entries) };
    };
    if (!ctx.args.length) {
      const pot = K.potOf(chat);
      if (!pot) return ctx.reply(tr(`💰 *JACKPOT*\nBelum ada pot. Mulai: *${p}jackpot <bet>* — semua orang bisa ikut ${K.POT_MS / 1000} detik, 1 pemenang acak (peluang = proporsi taruhan) bawa ${100 - K.FEE_POT * 100}% pot. Minimal 2 peserta.`, `💰 *JACKPOT*\nNo pot yet. Start: *${p}jackpot <bet>* — anyone can join for ${K.POT_MS / 1000}s, one random winner (odds = share of bets) takes ${100 - K.FEE_POT * 100}% of the pot. Needs 2+ players.`));
      const s = show(pot); return ctx.reply(s.text, { mentions: s.mentions });
    }
    const t = await takeBet(env, ctx.args[0]); if (!t) return;
    const res = K.joinPot(chat, me, nameOf(env), t.r, t.bet);
    if (res.error) return ctx.reply(betErr(res));
    const s = show(res.pot), mine = Math.round(K.potChance(res.pot, me) * 100);
    return ctx.reply(`${res.fresh && Object.keys(res.pot.entries).length === 1 ? tr("🎉 Pot dibuka! Ajak teman ikut!\n", "🎉 Pot opened! Get your friends in!\n") : ""}${s.text}\n\n🎯 ${tr("Peluangmu", "Your odds")}: ${mine}%`, { mentions: s.mentions });
  },
});

/* ── 🎰 .casino (menu, statistik, peringkat) ─────────────────────────────── */
const casino = definePlugin({
  name: "casino", aliases: ["kasino", "gamble"], category: "game", ownHelp: true,
  description: "Casino menu, your gambling stats and the profit ranking", usage: "casino · casino stats [@tag] · casino top",
  async run(env) {
    const { ctx } = env, p = ctx.pfx, sub = (ctx.args[0] ?? "").toLowerCase();
    if (sub === "stats" || sub === "rekor") {
      const id = who(ctx) ?? ctx.senderId, s = db.users[id]?.casino ?? { net: 0, plays: 0, won: 0, lost: 0, best: 0 };
      return ctx.reply(tr(`📊 *Statistik Casino* — @${numberOf(id)}\n🎲 Main: ${fmt(s.plays)} · ✅ ${fmt(s.won)} · ❌ ${fmt(s.lost)}\n💹 Net: *${sign(s.net)}* Gold\n🏅 Kemenangan terbesar: ${fmt(s.best)} Gold`, `📊 *Casino stats* — @${numberOf(id)}\n🎲 Played: ${fmt(s.plays)} · ✅ ${fmt(s.won)} · ❌ ${fmt(s.lost)}\n💹 Net: *${sign(s.net)}* Gold\n🏅 Biggest win: ${fmt(s.best)} Gold`), { mentions: [id] });
    }
    if (sub === "top" || sub === "rank") {
      const top = Object.entries(db.users).filter(([, u]) => u.casino?.plays).sort((a, b) => b[1].casino.net - a[1].casino.net).slice(0, 10);
      if (!top.length) return ctx.reply(tr("📊 Belum ada yang berjudi.", "📊 Nobody has gambled yet."));
      return ctx.reply([`🏆 *${tr("Top Profit Casino", "Casino Profit Ranking")}*`, ...top.map(([id, u], i) => `${i + 1}. @${numberOf(id)} — ${sign(u.casino.net)} (${fmt(u.casino.plays)}×)`)].join("\n"), { mentions: top.map(([id]) => id) });
    }
    return ctx.reply(tr(
      `🎰 *CASINO*  _(Gold virtual)_\n\n*Lawan bandar*\n› *${p}slot <bet>* — mesin slot, 777 = ×1000\n› *${p}roulette <bet> <red|black|odd|…|0-36>*\n› *${p}dadu <bet> <big|small|seven|1-6>*\n› *${p}coin <bet> <head|tail>*\n› *${p}bj <bet>* — blackjack (hit / stand / double)\n› *${p}hilo <bet>* — tebak lebih tinggi/rendah, cash out\n› *${p}baccarat <bet> <player|banker|tie>*\n› *${p}wheel <bet>* — roda ×0 s/d ×5\n\n*Lawan pemain*\n› *${p}dadu @tag <bet>* · *${p}coin @tag <bet>* · *${p}highcard @tag <bet>*\n\n*Beramai-ramai*\n› *${p}jackpot <bet>* — pot grup, 1 pemenang acak\n\n› *${p}casino stats* · *${p}casino top*\n💡 Taruhan: ${fmt(K.MIN_BET)}–${fmt(K.MAX_BET)} · bisa *2k*, *1jt*, *half*, *all*`,
      `🎰 *CASINO*  _(virtual Gold)_\n\n*Against the house*\n› *${p}slot <bet>* — slot machine, 777 = ×1000\n› *${p}roulette <bet> <red|black|odd|…|0-36>*\n› *${p}dadu <bet> <big|small|seven|1-6>*\n› *${p}coin <bet> <head|tail>*\n› *${p}bj <bet>* — blackjack (hit / stand / double)\n› *${p}hilo <bet>* — guess higher/lower, cash out\n› *${p}baccarat <bet> <player|banker|tie>*\n› *${p}wheel <bet>* — wheel ×0 to ×5\n\n*Against players*\n› *${p}dadu @tag <bet>* · *${p}coin @tag <bet>* · *${p}highcard @tag <bet>*\n\n*Group game*\n› *${p}jackpot <bet>* — group pot, one random winner\n\n› *${p}casino stats* · *${p}casino top*\n💡 Bets: ${fmt(K.MIN_BET)}–${fmt(K.MAX_BET)} · accepts *2k*, *1m*, *half*, *all*`,
    ));
  },
});

export default [casino, slot, roulette, dadu, coin, highcard, bj, hilo, baccarat, wheel, jackpot];
