import crypto from "node:crypto";
import { sameUser } from "#lib/suit";

/*
 * Penyimpanan permainan UNO (di memori; di lib/ supaya tidak ter-reset saat plugin di-hot-reload).
 * game = { id, code, kind: "duel" | "room", chat, sock, prefix, max,
 *          state: "pending" (duel menunggu jawaban) | "lobby" (ruang menunggu pemain) | "playing",
 *          players: [{ id, pn, lid, name }]  — players[0] = pembuat/host,
 *          st (state mesin lib/uno.js), tableKey, handKeys: [kunci DM tangan per pemain], last, timer }
 */
export const PENDING_MS = 60_000;       // jawaban tantangan duel
export const LOBBY_MS = 5 * 60_000;     // ruang menunggu pemain
export const TURN_MS = 4 * 60_000;      // batas waktu satu giliran — lewat = dianggap keluar

const games = new Map();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // tanpa I/O/0/1 supaya tidak tertukar

const RESERVED = /^(help|hand|draw|pass|stat|ruang|room)$/i; // jangan bentrok dengan sub-perintah
const newCode = () => {
  for (let tries = 0; tries < 50; tries++) {
    const code = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join("");
    if (!RESERVED.test(code) && ![...games.values()].some((g) => g.code === code)) return code;
  }
  return crypto.randomBytes(3).toString("hex").toUpperCase();
};

export const unoStore = {
  create(fields) {
    const game = { id: crypto.randomBytes(2).toString("hex"), code: newCode(), state: "pending", kind: "duel", max: 2, timer: null, tableKey: null, handKeys: [], last: "", ...fields };
    games.set(game.id, game);
    return game;
  },
  remove(game) {
    clearTimeout(game.timer);
    games.delete(game.id);
  },
  all: () => [...games.values()],
  ofPlayer: (ctx) => [...games.values()].find((g) => g.players.some((p) => sameUser(p, ctx))) ?? null,
  ofJid: (jid) => [...games.values()].find((g) => g.players.some((p) => [p.id, p.pn, p.lid].includes(jid))) ?? null,
  pendingFor: (chat, ctx) => [...games.values()].find((g) => g.state === "pending" && g.chat === chat && sameUser(g.players[1], ctx)) ?? null,
  playing: (chat, ctx) => [...games.values()].find((g) => g.state === "playing" && g.chat === chat && g.players.some((p) => sameUser(p, ctx))) ?? null,
  byCode: (code) => [...games.values()].find((g) => g.state === "lobby" && g.code === String(code ?? "").trim().toUpperCase()) ?? null,
  lobbiesIn: (chat) => [...games.values()].filter((g) => g.state === "lobby" && g.chat === chat),
  sideOf: (g, ctx) => { const i = g.players.findIndex((p) => sameUser(p, ctx)); return i < 0 ? null : i; },
};
