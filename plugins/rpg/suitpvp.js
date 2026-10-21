import { botIdentities } from "#lib/groups";
import { db } from "#lib/database";
import { sendInteractive } from "#lib/interactive";
import { logger } from "#lib/logger";
import { t } from "#lib/i18n";
import { definePlugin } from "#lib/plugins";
import { editPayload } from "#lib/preview";
import * as game from "#lib/rpg";
import { sendResult } from "#lib/rpgui";
import { MAX_ROUNDS, PENDING_MS, PICK_MS, suitStore } from "#lib/suit";
import { bare, numberOf, sleep } from "#lib/utils";

/*
 * Suit PvP lawan pemain lain (khusus grup).
 *
 *   .suitpvp @lawan [taruhan]
 *     → lawan membalas di grup:  terima = y / gas / yes / oke   ·   tolak = n / gak / no / gamau
 *     → kalau diterima, bot mengirim pilihan (✊ ✌️ ✋) ke CHAT PRIBADI masing-masing (rahasia)
 *     → setelah keduanya memilih: hitung mundur di grup → "Congratulations......" + kartu hasil
 *     → seri diulang sampai 3 ronde.  Hadiah: bonus gold + taruhan + XP untuk pemenang.
 *   .suitpvp batal   → batalkan tantangan / permainanmu
 *
 * State permainan ada di lib/suit.js; plugin .suitpick menerima tombol pilihan di chat pribadi.
 */
const ACCEPT = /^(y|gas|yes|oke)$/;
const DECLINE = /^(n|gak|no|gamau)$/;
const fmt = (n) => Number(n).toLocaleString("id-ID");
const tag = (p) => `@${numberOf(p.id)}`;
const nameFor = (id, fallback) => { const u = db.users[id]; return u?.reg?.name ?? u?.name ?? fallback ?? numberOf(id); };
const sideName = (side) => (side === "a" ? "b" : "a");
const mentionsOf = (g) => [g.a.id, g.b.id];
const betText = (g) => (g.bet ? t("sp.bet", { n: fmt(g.bet) }) : t("sp.noBet"));
const pickText = (key) => `${game.SUIT[key].icon} *${game.SUIT[key].name}*`;

const say = (g, text, extra = {}) => g.sock.sendMessage(g.chat, { text, mentions: mentionsOf(g), ...extra }).catch((err) => logger.warn(`Suit PvP: failed to send to the group (${err.message})`));
const dm = (g, side, text) => g.sock.sendMessage(g[side].pn ?? g[side].id, { text }).catch(() => {});
const arm = (g, ms, fn) => {
  clearTimeout(g.timer);
  g.timer = setTimeout(() => fn(g).catch((err) => logger.error(`Suit PvP: ${err.stack ?? err.message}`)), ms);
  g.timer.unref?.();
};

// Lingkungan "seolah-olah" pesan datang dari grup oleh pemenang — supaya kartu hasil terkirim ke grup (bukan ke chat pribadi).
const groupEnv = (env, g, who) => ({
  ...env,
  user: db.user(who.id, who.name),
  ctx: {
    ...env.ctx,
    chatId: g.chat,
    senderId: who.id,
    isGroup: true,
    quote: async () => undefined,
    reply: (content, opts = {}) => g.sock.sendMessage(g.chat, typeof content === "string" ? { text: content, ...(opts.mentions && { mentions: opts.mentions }) } : content),
  },
});

/* ── alur ────────────────────────────────────────────────────────────────── */
const ask = (g, side) => {
  const foe = g[sideName(side)];
  const text = t("sp.ask", { r: g.round, max: MAX_ROUNDS, name: foe.name, bet: betText(g), sec: PICK_MS / 1000 });
  const buttons = Object.entries(game.SUIT).map(([key, s]) => ({ type: "quick", text: `${s.icon} ${s.name}`, id: `${g.prefix}suitpick ${g.id} ${g.round} ${key}` }));
  return sendInteractive(g.sock, g[side].pn ?? g[side].id, { text, buttons, offer: false });
};

const startRound = async (g) => {
  g.state = "picking";
  g.picks = { a: null, b: null };
  arm(g, PICK_MS, expirePick);
  const sent = await Promise.allSettled(["a", "b"].map((side) => ask(g, side)));
  const failed = ["a", "b"].filter((_, i) => sent[i].status === "rejected");
  if (failed.length) {
    suitStore.remove(g);
    await say(g, t("sp.dmFail", { who: failed.map((s) => tag(g[s])).join(" & "), p: g.prefix }));
  }
};

const expirePending = async (g) => {
  if (g.state !== "pending") return;
  suitStore.remove(g);
  await say(g, t("sp.expPending", { a: tag(g.a), b: tag(g.b) }));
};

const expirePick = async (g) => {
  if (g.state !== "picking") return;
  const waiting = ["a", "b"].filter((s) => !g.picks[s]);
  suitStore.remove(g);
  await say(g, t("sp.expPick", { who: waiting.map((s) => tag(g[s])).join(" & ") }));
};

const accept = async (env, g) => {
  const { ctx } = env;
  Object.assign(g.b, { id: ctx.senderId, pn: ctx.senderPn, lid: ctx.senderLid, name: nameFor(ctx.senderId, ctx.pushName) });
  g.state = "picking";
  clearTimeout(g.timer);
  await say(g, t("sp.accepted", { a: tag(g.a), b: tag(g.b), bet: betText(g) }));
  await startRound(g);
};

const decline = async (env, g) => {
  suitStore.remove(g);
  await say(g, t("sp.declined", { a: tag(g.a), b: tag(g.b) }));
};

const reveal = async (env, g) => {
  g.state = "reveal";
  clearTimeout(g.timer);
  const head = (n) => t("sp.reveal", { n });
  const first = await say(g, head(3));
  const key = first?.key;
  for (const n of [2, 1]) {
    await sleep(1000);
    if (key) await g.sock.sendMessage(g.chat, editPayload(key, head(n), { mentions: mentionsOf(g) })).catch(() => {});
  }
  await sleep(1000);

  const { a: pa, b: pb } = g.picks, S = game.SUIT, result = game.suitWinner(pa, pb);
  const recap = (side, line) => dm(g, side, t("sp.recap", { x: `${S[g.picks[side]].icon} ${S[g.picks[side]].name}`, y: `${S[g.picks[sideName(side)]].icon} ${S[g.picks[sideName(side)]].name}`, line }));
  const edit = (text) => (key ? g.sock.sendMessage(g.chat, editPayload(key, text, { mentions: mentionsOf(g) })).catch(() => {}) : say(g, text));

  // Seri → ulang (maks 3 ronde).
  if (result === 0) {
    if (g.round < MAX_ROUNDS) {
      await edit(t("sp.drawGroup", { pick: `${S[pa].icon} ${S[pa].name}`, r: g.round + 1, max: MAX_ROUNDS }));
      await Promise.all([recap("a", t("sp.drawAgain")), recap("b", t("sp.drawAgain"))]);
      g.round++;
      return startRound(g);
    }
    for (const side of ["a", "b"]) { game.getRpg(db.user(g[side].id, g[side].name)).pvp.suitDraw++; }
    db.save("users");
    suitStore.remove(g);
    await edit(t("sp.drawFinal", { max: MAX_ROUNDS, a: tag(g.a), b: tag(g.b) }));
    await Promise.all([recap("a", t("sp.drawTotal")), recap("b", t("sp.drawTotal"))]);
    return;
  }

  const ws = result === 1 ? "a" : "b", ls = sideName(ws), wp = g[ws], lp = g[ls];
  const wr = game.getRpg(db.user(wp.id, wp.name)), lr = game.getRpg(db.user(lp.id, lp.name));
  const settle = game.suitSettle(wr, lr, g.bet);
  db.save("users");
  suitStore.remove(g);

  await edit(t("sp.congrats", { w: tag(wp), x: `${S[g.picks[ws]].icon} ${S[g.picks[ws]].name}`, y: `${S[g.picks[ls]].icon} ${S[g.picks[ls]].name}` }));
  await sendResult(groupEnv(env, g, wp), wr, {
    title: t("sp.cardTitle"),
    subtitle: t("sp.cardSub", { w: wp.name, l: lp.name }),
    badge: t("sp.cardBadge"),
    accent: "0xffd566",
    rows: [{ icon: "sword", text: t("sp.cardRow", { x: S[g.picks[ws]].name, y: S[g.picks[ls]].name }), sub: t("sp.cardRowSub", { w: wp.name, l: lp.name, r: g.round }) }, ...settle.winRows],
    ok: true,
  }, [lp.id]);
  await Promise.all([
    recap(ws, t("sp.winLine", { stake: settle.stake ? t("sp.stakeWin", { n: fmt(settle.stake) }) : "", bonus: fmt(settle.bonus) })),
    recap(ls, t("sp.loseLine", { stake: settle.stake ? t("sp.stakeLose", { n: fmt(settle.stake) }) : "" })),
  ]);
};

// Dipanggil dari tombol / ketikan di chat pribadi.
const choose = async (env, choice, { gid, round } = {}) => {
  const { ctx } = env;
  const g = gid ? suitStore.get(gid) : suitStore.ofPlayer(ctx);
  if (!g) return ctx.reply(t("sp.noGame"));
  const side = suitStore.side(g, ctx);
  if (!side) return ctx.reply(t("sp.notYours"));
  if (g.state !== "picking") return ctx.reply(t("sp.notTime"));
  if (round && round !== g.round) return ctx.reply(t("sp.oldButton"));
  const S = game.SUIT;
  if (g.picks[side]) return ctx.reply(t("sp.locked", { pick: pickText(g.picks[side]) }));

  g.picks[side] = choice;
  const other = sideName(side);
  await ctx.reply(t("sp.chosen", { pick: pickText(choice), wait: g.picks[other] ? t("sp.waitGroup") : t("sp.waitOpp") }));
  await say(g, t("sp.chosenGroup", { name: g[side].name, wait: g.picks[other] ? "" : t("sp.waitShort") }));
  if (g.picks.a && g.picks.b) await reveal(env, g);
};

/* ── command ─────────────────────────────────────────────────────────────── */
const suitpvp = definePlugin({
  name: "suitpvp",
  aliases: ["suit", "suitpk"],
  category: "rpg",
  access: { group: true },
  description: "Rock-paper-scissors vs another player (tag them, pick in private chat, Gold + XP prize)",
  usage: "suitpvp @opponent [bet]  ·  suitpvp cancel",
  async run(env) {
    const { ctx, user, sock } = env, p = ctx.pfx;

    if (/^(batal|cancel|stop)$/i.test(ctx.args[0] ?? "")) {
      const mine = suitStore.ofPlayer(ctx);
      if (!mine) return ctx.reply(t("sp.notIn"));
      suitStore.remove(mine);
      return say(mine, t("sp.cancelled", { a: tag(mine.a), b: tag(mine.b), name: nameFor(ctx.senderId, ctx.pushName) }));
    }

    const targetId = ctx.mentionedJid[0] ?? ctx.quotedSender;
    if (!targetId) return ctx.reply(t("sp.noTag", { p }));
    if ([ctx.senderId, ctx.senderPn, ctx.senderLid].filter(Boolean).map(bare).includes(bare(targetId))) return ctx.reply(t("sp.self"));
    if (botIdentities(sock).includes(bare(targetId))) return ctx.reply(t("sp.bot"));
    const tu = db.users[targetId];
    if (!tu?.rpg) return ctx.reply(t("sp.notRpg"));
    if (suitStore.ofPlayer(ctx)) return ctx.reply(t("sp.busy", { p }));
    if (suitStore.ofJid(targetId)) return ctx.reply(t("sp.oppBusy"));

    const r = game.getRpg(user), tr = game.getRpg(tu);
    const bet = game.parseAmount(ctx.args.find((a) => /^(\d|all$|semua$)/i.test(a)), Math.min(r.gold, tr.gold));
    if (bet > r.gold) return ctx.reply(t("sp.goldYou", { n: fmt(bet), have: fmt(r.gold) }));
    if (bet > tr.gold) return ctx.reply(t("sp.goldOpp", { n: fmt(bet), have: fmt(tr.gold) }));

    const g = suitStore.create({
      chat: ctx.chatId, sock, prefix: p, bet,
      a: { id: ctx.senderId, pn: ctx.senderPn, lid: ctx.senderLid, name: nameFor(ctx.senderId, ctx.pushName) },
      b: { id: targetId, name: nameFor(targetId) },
    });
    arm(g, PENDING_MS, expirePending);
    await ctx.reply(
      t("sp.challenge", { a: tag(g.a), b: tag(g.b), bet: betText(g), sec: PENDING_MS / 1000 }),
      { mentions: mentionsOf(g) },
    );
  },

  // Jawaban tantangan (di grup) dan pilihan suit yang diketik (di chat pribadi).
  async passive(env) {
    const { ctx } = env;
    if (ctx.fromMe || ctx.isCmd || !ctx.text) return;
    const t = ctx.text.trim().toLowerCase().replace(/[.!?\s]+$/g, "");

    if (ctx.isGroup) {
      const g = suitStore.pendingFor(ctx.chatId, ctx);
      if (!g) return;
      if (ACCEPT.test(t)) return accept(env, g);
      if (DECLINE.test(t)) return decline(env, g);
      return;
    }
    const choice = game.parseSuit(t);
    if (choice && suitStore.ofPlayer(ctx)?.state === "picking") return choose(env, choice);
  },
});

// Tombol pilihan di chat pribadi: .suitpick <id> <ronde> <batu|gunting|kertas>
const suitpick = definePlugin({
  name: "suitpick",
  category: "rpg",
  hidden: true,
  access: { private: true },
  description: "Pick rock / paper / scissors (sent automatically by the buttons)",
  usage: "suitpick <rock|scissors|paper>",
  async run(env) {
    const { ctx } = env, args = ctx.args;
    const choice = game.parseSuit(args.at(-1));
    if (!choice) return ctx.reply(t("sp.pickHint"));
    const gid = args.length > 1 && /^[0-9a-f]{4}$/i.test(args[0]) ? args[0] : null;
    const round = args.length > 2 ? Number(args[1]) || null : null;
    await choose(env, choice, { gid, round });
  },
});

export default [suitpvp, suitpick];
