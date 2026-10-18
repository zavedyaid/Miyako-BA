import crypto from "node:crypto";
import { bare } from "#lib/utils";

/*
 * Penyimpanan permainan Suit PvP (di memori — hilang saat bot restart, tidak apa-apa karena durasinya singkat).
 * Ada di lib/ supaya tidak ikut ter-reset saat plugin di-hot-reload.
 *
 * game = { id, chat, state: "pending" | "picking" | "reveal", bet, round, sock,
 *          a: { id, pn, lid, name }, b: {…}, picks: { a, b }, timer }
 */
export const PENDING_MS = 60_000;
export const PICK_MS = 90_000;
export const MAX_ROUNDS = 3;

const games = new Map();

const idsOf = (p) => [p.id, p.pn, p.lid].filter(Boolean).map(bare);
const ctxIds = (ctx) => [ctx.senderId, ctx.senderPn, ctx.senderLid].filter(Boolean).map(bare);
export const sameUser = (p, ctx) => {
  const mine = ctxIds(ctx);
  return idsOf(p).some((id) => mine.includes(id));
};
export const sameId = (p, jid) => idsOf(p).includes(bare(jid));

export const suitStore = {
  create(fields) {
    const id = crypto.randomBytes(2).toString("hex");
    const game = { id, state: "pending", round: 1, picks: { a: null, b: null }, timer: null, ...fields };
    games.set(id, game);
    return game;
  },
  get: (id) => games.get(String(id ?? "").toLowerCase()) ?? null,
  remove(game) {
    clearTimeout(game.timer);
    games.delete(game.id);
  },
  // Game yang sedang melibatkan orang ini (sebagai a atau b).
  ofPlayer: (ctx) => [...games.values()].find((g) => sameUser(g.a, ctx) || sameUser(g.b, ctx)) ?? null,
  ofJid: (jid) => [...games.values()].find((g) => sameId(g.a, jid) || sameId(g.b, jid)) ?? null,
  // Tantangan yang menunggu jawaban orang ini di grup ini.
  pendingFor: (chat, ctx) => [...games.values()].find((g) => g.state === "pending" && g.chat === chat && sameUser(g.b, ctx)) ?? null,
  side: (game, ctx) => (sameUser(game.a, ctx) ? "a" : sameUser(game.b, ctx) ? "b" : null),
};
