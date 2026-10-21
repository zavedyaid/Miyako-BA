import { readable } from "#lib/cards";
import { apply, looksLikeMove, material, newGame, parseMove, statusOf, toSan } from "#lib/chess";
import { renderBoard, textBoard } from "#lib/chessboard";
import { config } from "#lib/config";
import { IDLE_MS, PENDING_MS, chessStore } from "#lib/chessgames";
import { db } from "#lib/database";
import { botIdentities } from "#lib/groups";
import { t } from "#lib/i18n";
import { logger } from "#lib/logger";
import { definePlugin } from "#lib/plugins";
import * as rpg from "#lib/rpg";
import { suitStore } from "#lib/suit";
import { tr } from "#lib/tr";
import { bare, numberOf } from "#lib/utils";

/*
 * Catur sungguhan lawan pemain yang di-tag (khusus grup).
 *   .chess @lawan → lawan menjawab y/gas/yes/oke (terima) atau n/gak/no/gamau (tolak) → warna diacak
 *   Langkah diketik langsung di chat: e4, Nf3, exd5, O-O, e8=Q, e2e4 (atau .move e4 / .chess e4)
 *   .chess resign · .chess draw · .chess board · .chess abort · .chess stats [@tag]
 * Papan = GAMBAR BIASA (lib/chessboard.js) + caption giliran & petunjuk. Mesin & aturan: lib/chess.js.
 * Hadiah: menang +250 Gold & 60 XP (+peluang peti kayu), remis +50 Gold & 20 XP — bila tiap pemain sudah bermain ≥ MIN_MOVES langkah.
 * Tampilan: tiap langkah dikirim gambar papan baru, gambar papan sebelumnya dihapus (chat tetap bersih). Anti-spam: pesan langkah & balasan error dihapus otomatis.
 */
const ACCEPT = /^(y|gas|yes|oke)$/;
const DECLINE = /^(n|gak|no|gamau)$/;
const MIN_MOVES = 10;
const SUBS = new Set(["resign", "surrender", "menyerah", "draw", "remis", "board", "show", "abort", "cancel", "batal", "stats", "rekor", "help", "move"]);

const tag = (p) => `@${numberOf(p.id)}`;
const short = (p) => readable(p.name, "Player").slice(0, 16);
const nameFor = (id, fallback) => { const u = db.users[id]; return u?.reg?.name ?? u?.name ?? fallback ?? numberOf(id); };
const mentionsOf = (g) => (g.state === "pending" ? [g.a.id, g.b.id] : [g.white.id, g.black.id]);
const say = (g, text, extra = {}) => g.sock.sendMessage(g.chat, { text, mentions: mentionsOf(g), ...extra }).catch((err) => logger.warn(`Chess: failed to send (${err.message})`));
// Anti-spam: balasan singkat bot (salah giliran, langkah tak sah, dst.) + pesan pemicunya dihapus otomatis.
const tidy = async (env, text, ms = 6000) => {
  const { ctx, sock } = env;
  const sent = await ctx.reply(text, { preview: false }).catch(() => null);
  if (config.features?.chessCleanChat === false) return sent;
  const wipe = () => {
    if (ctx.raw?.key) sock.sendMessage(ctx.chatId, { delete: ctx.raw.key }).catch(() => {});
    if (sent?.key) sock.sendMessage(ctx.chatId, { delete: sent.key }).catch(() => {});
  };
  setTimeout(wipe, ms).unref?.();
  return sent;
};
const arm = (g, ms, fn) => {
  clearTimeout(g.timer);
  g.timer = setTimeout(() => fn(g).catch((err) => logger.error(`Chess: ${err.stack ?? err.message}`)), ms);
  g.timer.unref?.();
};

const turnLine = (g) => t(g.st.turn === "w" ? "chess.turnW" : "chess.turnB", { name: tag(g.st.turn === "w" ? g.white : g.black) });

// Label status di kartu: [teks, warna]
const statusLabel = (g, stat) =>
  stat.result === "checkmate" ? [t("chess.sMate"), "0x6fdc8c"]
  : stat.over ? [t("chess.sDraw"), "0xffd566"]
  : stat.check ? [t("chess.sCheck"), "0xff7a8a"]
  : [t(g.st.turn === "w" ? "chess.sWhite" : "chess.sBlack"), "0xffd566"];

// Papan = gambar biasa (bukan link preview). Tiap langkah dikirim gambar baru lalu gambar papan sebelumnya dihapus,
// jadi di chat selalu hanya ada satu papan terbaru. Setelah permainan selesai, papan terakhir dibiarkan sebagai arsip.
const sendBoard = async (g, caption, { stat, label, over = false } = {}) => {
  const state = stat ?? statusOf(g.st);
  const [statusText, statusColor] = label ?? statusLabel(g, state);
  Object.assign(g, { names: { w: short(g.white), b: short(g.black) }, statusText, over, version: (g.version ?? 0) + 1 });

  const mat = material(g.st);
  let image = null;
  try {
    image = await renderBoard(g.st, {
      names: { w: short(g.white), b: short(g.black) },
      sub: { w: mat.diff > 0 ? `+${mat.diff}` : "", b: mat.diff < 0 ? `+${-mat.diff}` : "" },
      headRight: t("chess.move", { n: g.st.full }),
      status: statusText, statusColor,
      lastSan: g.st.san.length ? t("chess.lastShort", { san: g.st.san.at(-1) }) : "",
      last: g.last, check: state.check, over,
    });
  } catch (err) {
    logger.warn(`Chess: board image failed (${err.message})`);
  }

  const tip = over ? "" : `\n\n♟️ ${t("chess.tip", { p: g.prefix })}`;
  const prev = g.boardKey;
  let sent = null;
  try {
    sent = image
      ? await g.sock.sendMessage(g.chat, { image, caption: `${caption}${tip}`, mentions: mentionsOf(g) })
      : await g.sock.sendMessage(g.chat, { text: `${caption}${tip}\n\n${t("chess.renderFail")}\n${textBoard(g.st)}`, mentions: mentionsOf(g) });
  } catch (err) {
    logger.warn(`Chess: failed to send board (${err.message})`);
  }
  g.boardKey = over || !sent?.key ? null : sent.key;
  if (prev && sent?.key) g.sock.sendMessage(g.chat, { delete: prev }).catch(() => {});
  return !!sent?.key;
};

/* ── akhir permainan ─────────────────────────────────────────────────────── */
const record = (id, name, key) => {
  const u = db.user(id, name);
  u.chess ??= { win: 0, loss: 0, draw: 0 };
  u.chess[key]++;
  return u;
};

const finish = async (g, { winner = null, text, label }) => {
  chessStore.remove(g);
  const win = winner ? (winner === "w" ? g.white : g.black) : null, lose = winner ? (winner === "w" ? g.black : g.white) : null;
  const lines = [text];

  const enough = g.st.san.length >= MIN_MOVES * 2;
  const recs = [];
  if (win) { recs.push([win, "win"], [lose, "loss"]); } else { recs.push([g.white, "draw"], [g.black, "draw"]); }
  for (const [p, key] of recs) {
    const u = record(p.id, p.name, key);
    if (enough && (key === "win" || key === "draw")) {
      const r = rpg.chessReward(rpg.getRpg(u), key === "win");
      lines.push(t("chess.reward", { name: tag(p), gold: r.gold, xp: r.xp }) + (r.item ? ` · 🎁 ${rpg.ITEMS[r.item].name}` : ""));
    }
  }
  if (!enough) lines.push(t("chess.noReward", { n: MIN_MOVES }));
  db.save("users");
  await sendBoard(g, lines.join("\n"), { label, over: true });
};

const abandon = async (g) => {
  if (g.state === "pending") {
    chessStore.remove(g);
    return say(g, t("chess.timeout", { a: tag(g.a), b: tag(g.b) }));
  }
  chessStore.remove(g);
  return say(g, t("chess.abandoned", { a: tag(g.white), b: tag(g.black), min: IDLE_MS / 60_000 }));
};

const RESULT_TEXT = { stalemate: "chess.stalemate", fifty: "chess.fifty", material: "chess.material", repetition: "chess.repetition" };

/* ── langkah ─────────────────────────────────────────────────────────────── */
const commit = async (g, side, input) => {
  if (g.st.turn !== side) return { error: t("chess.notTurn") };
  const parsed = parseMove(g.st, input);
  if (!parsed.move) return { error: t(parsed.error === "ambiguous" ? "chess.ambiguous" : "chess.illegal", { move: String(input).trim().slice(0, 20) }) };

  const move = parsed.move, san = toSan(g.st, move);
  const next = apply(g.st, move);
  next.san = [...g.st.san, san];
  g.st = next; g.last = move; g.drawOffer = null;
  arm(g, IDLE_MS, abandon);

  const stat = statusOf(g.st);
  if (stat.result === "checkmate") {
    const winner = stat.winner, who = winner === "w" ? g.white : g.black;
    await finish(g, { winner, text: t("chess.mate", { winner: tag(who), san }), label: [t("chess.sMate"), "0x6fdc8c"] });
  } else if (stat.over) {
    await finish(g, { text: t(RESULT_TEXT[stat.result]), label: [t("chess.sDraw"), "0xffd566"] });
  } else {
    await sendBoard(g, `${turnLine(g)}\n${t("chess.last", { san })}`, { stat });
  }
  return {};
};

const playMove = async (env, g, input, { quiet = false } = {}) => {
  const { ctx, sock } = env, side = chessStore.sideOf(g, ctx);
  if (g.st.turn !== side) return quiet ? undefined : tidy(env, t("chess.notTurn"));
  const out = await commit(g, side, input);
  if (out.error) return tidy(env, out.error);
  // Anti-spam: pesan langkah pemain dihapus (perlu bot admin) supaya chat tidak penuh; matikan: features.chessCleanChat = false
  if (config.features?.chessCleanChat !== false && ctx.raw?.key) sock.sendMessage(ctx.chatId, { delete: ctx.raw.key }).catch(() => {});
};

/* ── tantangan ───────────────────────────────────────────────────────────── */
const accept = async (env, g) => {
  const { ctx } = env;
  Object.assign(g.b, { id: ctx.senderId, pn: ctx.senderPn, lid: ctx.senderLid, name: nameFor(ctx.senderId, ctx.pushName) });
  clearTimeout(g.timer);
  const [white, black] = Math.random() < 0.5 ? [g.a, g.b] : [g.b, g.a];
  Object.assign(g, { state: "playing", white, black, st: newGame() });
  g.st.san = [];
  arm(g, IDLE_MS, abandon);
  await sendBoard(g, [t("chess.start", { w: tag(white), b: tag(black) }), "", turnLine(g)].join("\n"));
};

const decline = async (g) => {
  chessStore.remove(g);
  await say(g, t("chess.declined", { a: tag(g.a), b: tag(g.b) }));
};

/* ── command ─────────────────────────────────────────────────────────────── */
const chess = definePlugin({
  name: "chess",
  aliases: ["catur", "ch"],
  category: "game",
  access: { group: true },
  description: "Play real chess against a tagged player (moves typed in chat, board card)",
  usage: "chess @tag  ·  chess resign|draw|board|abort|stats",
  async run(env) {
    const { ctx, sock } = env, p = ctx.pfx;
    const sub = (ctx.args[0] ?? "").toLowerCase();
    const mine = chessStore.ofPlayer(ctx);
    const here = mine && mine.chat === ctx.chatId && mine.state === "playing" ? mine : null;

    if (sub === "help") return ctx.reply(t("chess.help", { p, n: MIN_MOVES }));

    if (sub === "stats" || sub === "rekor") {
      const id = ctx.mentionedJid[0] ?? ctx.quotedSender ?? ctx.senderId;
      const u = db.users[id], c = u?.chess ?? { win: 0, loss: 0, draw: 0 };
      return ctx.reply(t("chess.stats", { name: `@${numberOf(id)}`, w: c.win, d: c.draw, l: c.loss }), { mentions: [id] });
    }

    if (["abort", "cancel", "batal"].includes(sub)) {
      if (!mine) return ctx.reply(t("chess.noGame"));
      if (mine.state === "playing" && mine.st.san.length >= 2) return ctx.reply(t("chess.cantAbort", { p }));
      chessStore.remove(mine);
      return say(mine, t("chess.aborted"));
    }

    if (["resign", "surrender", "menyerah"].includes(sub)) {
      if (!here) return ctx.reply(t("chess.noGame"));
      const side = chessStore.sideOf(here, ctx), winner = side === "w" ? "b" : "w";
      const [loser, victor] = side === "w" ? [here.white, here.black] : [here.black, here.white];
      return finish(here, { winner, text: t("chess.resigned", { loser: tag(loser), winner: tag(victor) }), label: [t("chess.sResign"), "0xff7a8a"] });
    }

    if (sub === "draw" || sub === "remis") {
      if (!here) return ctx.reply(t("chess.noGame"));
      const side = chessStore.sideOf(here, ctx);
      if (here.drawOffer && here.drawOffer !== side) return finish(here, { text: t("chess.drawAgreed"), label: [t("chess.sDraw"), "0xffd566"] });
      if (here.drawOffer === side) return ctx.reply(t("chess.drawSent"));
      here.drawOffer = side;
      const [a, b] = side === "w" ? [here.white, here.black] : [here.black, here.white];
      return say(here, t("chess.drawOffer", { a: tag(a), b: tag(b), p }));
    }

    if (sub === "board" || sub === "show") {
      if (!here) return ctx.reply(t("chess.noGame"));
      if (Date.now() - (here.boardCmdAt ?? 0) < 15_000) return tidy(env, tr("⏳ Papan baru saja dikirim — tunggu sebentar.", "⏳ The board was just sent — wait a moment."), 4000);
      here.boardCmdAt = Date.now();
      return sendBoard(here, `${turnLine(here)}${here.st.san.length ? `\n${t("chess.last", { san: here.st.san.at(-1) })}` : ""}`, {});
    }

    // ".chess e4" / ".chess move e4" → langkah
    const moveText = sub === "move" ? ctx.args.slice(1).join(" ") : ctx.args.join(" ");
    const targetId = ctx.mentionedJid[0] ?? (ctx.args.length ? null : ctx.quotedSender);
    if (!targetId && (sub === "move" || looksLikeMove(ctx.args.join("")))) {
      if (!here) return ctx.reply(t("chess.noGame"));
      return playMove(env, here, moveText);
    }

    // tantang pemain
    if (!targetId) return ctx.reply(t("chess.help", { p, n: MIN_MOVES }).split("\n")[0] + "\n" + t("chess.noTag", { p }));
    if ([ctx.senderId, ctx.senderPn, ctx.senderLid].filter(Boolean).map(bare).includes(bare(targetId))) return ctx.reply(t("chess.self"));
    if (botIdentities(sock).includes(bare(targetId))) return ctx.reply(t("chess.bot"));
    if (mine) return ctx.reply(t("chess.busy", { p }));
    if (chessStore.ofJid(targetId) || suitStore.ofJid(targetId)) return ctx.reply(t("chess.oppBusy"));

    const g = chessStore.create({
      chat: ctx.chatId, sock, prefix: p,
      a: { id: ctx.senderId, pn: ctx.senderPn, lid: ctx.senderLid, name: nameFor(ctx.senderId, ctx.pushName) },
      b: { id: targetId, name: nameFor(targetId) },
    });
    arm(g, PENDING_MS, abandon);
    await ctx.reply(t("chess.challenge", { a: tag(g.a), b: tag(g.b), sec: PENDING_MS / 1000 }), { mentions: mentionsOf(g) });
  },

  // Jawaban tantangan + langkah yang diketik biasa di chat.
  async passive(env) {
    const { ctx } = env;
    if (ctx.fromMe || ctx.isCmd || !ctx.text || !ctx.isGroup) return;
    const text = ctx.text.trim();

    const pending = chessStore.pendingFor(ctx.chatId, ctx);
    if (pending) {
      const word = text.toLowerCase().replace(/[.!?\s]+$/g, "");
      if (ACCEPT.test(word)) return accept(env, pending);
      if (DECLINE.test(word)) return decline(pending);
      return;
    }
    const g = chessStore.playing(ctx.chatId, ctx);
    if (!g || !looksLikeMove(text) || g.st.turn !== chessStore.sideOf(g, ctx)) return;
    return playMove(env, g, text, { quiet: true });
  },
});

const move = definePlugin({
  name: "move",
  aliases: ["mv", "langkah"],
  category: "game",
  hidden: true,
  access: { group: true },
  description: "Play a chess move (same as typing it in chat)",
  usage: "move <e4|Nf3|O-O|e2e4>",
  async run(env) {
    const { ctx } = env, g = chessStore.playing(ctx.chatId, ctx);
    if (!g) return ctx.reply(t("chess.noGame"));
    if (!ctx.args.length) return ctx.reply(t("chess.help", { p: ctx.pfx, n: MIN_MOVES }));
    return playMove(env, g, ctx.args.join(" "));
  },
});

export default [chess, move];
