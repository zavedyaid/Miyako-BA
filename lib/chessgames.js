import crypto from "node:crypto";
import { sameUser } from "#lib/suit";

/*
 * Penyimpanan permainan catur (di memori; ada di lib/ supaya tidak ter-reset saat plugin di-hot-reload).
 * game = { id, chat, sock, prefix, state: "pending" | "playing",
 *          a, b (penantang / yang ditantang) → setelah diterima: white, black = { id, pn, lid, name },
 *          st (state mesin catur), last (langkah terakhir), drawOffer: "w" | "b" | null, timer }
 */
export const PENDING_MS = 60_000;
export const IDLE_MS = 30 * 60_000;

const games = new Map();
const players = (g) => (g.state === "pending" ? [g.a, g.b] : [g.white, g.black]);

export const chessStore = {
  create(fields) {
    const game = { id: crypto.randomBytes(2).toString("hex"), state: "pending", drawOffer: null, last: null, timer: null, ...fields };
    games.set(game.id, game);
    return game;
  },
  remove(game) {
    clearTimeout(game.timer);
    games.delete(game.id);
  },
  all: () => [...games.values()],
  byId: (id) => games.get(id) ?? null,
  ofPlayer: (ctx) => [...games.values()].find((g) => players(g).some((p) => sameUser(p, ctx))) ?? null,
  ofJid: (jid) => [...games.values()].find((g) => players(g).some((p) => [p.id, p.pn, p.lid].includes(jid))) ?? null,
  pendingFor: (chat, ctx) => [...games.values()].find((g) => g.state === "pending" && g.chat === chat && sameUser(g.b, ctx)) ?? null,
  playing: (chat, ctx) => [...games.values()].find((g) => g.state === "playing" && g.chat === chat && players(g).some((p) => sameUser(p, ctx))) ?? null,
  sideOf: (g, ctx) => (sameUser(g.white, ctx) ? "w" : sameUser(g.black, ctx) ? "b" : null),
};
