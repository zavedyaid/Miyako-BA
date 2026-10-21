import crypto from "node:crypto";
import { db } from "#lib/database";
import { config } from "#lib/config";
import { logger } from "#lib/logger";
import { engine } from "#lib/gameengine";
import { verifyChess } from "#lib/chessverify";
import { DAILY_CLAIMS as DAILY_2048, MIN_SCORE as MIN_2048, decode as decode2048, replay as replay2048, rewardFor as reward2048 } from "#lib/g2048";
import { fmt, tr } from "#lib/tr";
import { dayKey } from "#lib/utils";

/*
 * Kode klaim game → .redeem <kode>. Satu pintu untuk SEMUA game di sheet WhatsApp.
 *   Format: <tag>~<sesi>~<data>     tag: 48 (2048) · dino · aby (Abyss) · chs (Catur vs AI)
 * Bot memberi tiap game sebuah SESI (seed / kunci / kekuatan RPG). Hasil game dikirim balik lewat kode;
 * bot tidak percaya skor dari klien:
 *   2048, Abyss, Catur AI → permainan diputar ulang di bot (mesin yang sama) dan hasilnya dihitung sendiri
 *   Dino                  → tanda tangan sesi + batas skor wajar terhadap waktu nyata (dino tidak bisa diputar ulang)
 * Batas harian per game & satu kode = satu klaim.
 */
const TTL = 3 * 3_600_000;
const sessions = (globalThis.__miyakoSessions ??= new Map()); // sid → { game, who, at, ... }

export const issue = (game, who, extra = {}) => {
  for (const [sid, v] of sessions) if (Date.now() - v.at > TTL) sessions.delete(sid);
  const sid = crypto.randomBytes(3).toString("hex");
  sessions.set(sid, { game, who, at: Date.now(), used: new Set(), msUsed: 0, ...extra });
  return sid;
};
export const newSeed = () => (Math.random() * 0xffffffff) >>> 0;

/* ── batas harian ── */
export const DAILY = { "2048": DAILY_2048, dino: 6, abyss: 6, chessai: 10 };
const todayCount = (user, game) => {
  const today = dayKey(config.timezone);
  if (user.gdaily?.day !== today) user.gdaily = { day: today, n: {} };
  return user.gdaily.n[game] ?? 0;
};
const bump = (user, game) => { user.gdaily.n[game] = (user.gdaily.n[game] ?? 0) + 1; };
export const dailyLeft = (user, game) => Math.max(0, DAILY[game] - todayCount(user, game));

const stat = (user, game, patch) => {
  user.games ??= {};
  const g = (user.games[game] ??= { plays: 0, best: 0 });
  g.plays++;
  for (const [k, v] of Object.entries(patch ?? {})) g[k] = Math.max(g[k] ?? 0, v);
};

/* ── dino ── */
export const cyrb53 = (str) => {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};
export const DINO_MIN = 250;
const DINO_RATE = 0.0365; // skor maksimum per milidetik (permainan menambah ±0,036/ms)
const dinoReward = (score) => ({
  gold: Math.min(300, Math.floor(score / 8)),
  xp: Math.min(70, Math.floor(score / 50)),
  ...(score >= 3000 ? { diamond: Math.min(3, Math.floor(score / 3000)) } : {}),
});

/* ── Abyss ── */
export const abyssReward = ({ cleared, won, diff }) => {
  const m = [1, 1.6, 2.4][diff] ?? 1;
  const items = {};
  if (cleared >= 3) items.petikayu = 1;
  if (cleared >= 7) items.petiemas = 1;
  if (won && diff === 2) items.petidiamond = 1;
  return {
    gold: Math.round((cleared * 55 + (won ? 600 : 0)) * m),
    xp: Math.round((cleared * 22 + (won ? 250 : 0)) * m),
    diamond: Math.floor(cleared / 5) * (diff ? 2 : 1) + (won ? [1, 3, 6][diff] : 0),
    ...(won ? { limit: [3, 6, 10][diff] } : {}),
    ...(Object.keys(items).length ? { items } : {}),
  };
};

/* ── Catur vs AI: hadiah per level (menang) · remis 35% · bonus sekali untuk clear pertama ── */
export const CHESS_LEVELS = [
  null,
  { name: "Newbie", gold: 60, xp: 30 },
  { name: "Beginner", gold: 100, xp: 45 },
  { name: "Casual", gold: 160, xp: 70, first: { items: { petikayu: 1 } } },
  { name: "Club", gold: 240, xp: 100 },
  { name: "Advanced", gold: 350, xp: 150, diamond: 1, first: { items: { petiemas: 1 }, diamond: 2 } },
  { name: "Expert", gold: 520, xp: 210, diamond: 2 },
  { name: "Master", gold: 760, xp: 300, diamond: 3, first: { items: { petiemas: 2 }, diamond: 4 } },
  { name: "Grandmaster", gold: 1200, xp: 450, diamond: 5, first: { items: { petidiamond: 1 }, diamond: 10, limit: 15 } },
];
export const chessWinReward = (level) => {
  const L = CHESS_LEVELS[level];
  return { gold: L.gold, xp: L.xp, ...(L.diamond ? { diamond: L.diamond } : {}) };
};
const mergeRewards = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = k === "items" ? { ...(out.items ?? {}), ...v } : (out[k] ?? 0) + v;
  return out;
};
export const chessProgress = (user) => (user.chessAi ??= { cleared: {}, win: 0, draw: 0, loss: 0 });
const CHESS_MIN_MOVES = 5;

const bad = (error) => ({ ok: false, error });
const b64Bytes = (str) => {
  let s = String(str ?? "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  try { return [...Buffer.from(s, "base64")]; } catch { return null; }
};
export const encodeShorts = (codes) => Buffer.from(Uint8Array.from(codes.flatMap((c) => [c & 255, c >> 8]))).toString("base64url");
const decodeShorts = (str) => {
  const bytes = b64Bytes(str);
  if (!bytes || bytes.length % 2 || bytes.length > 1200) return null;
  const out = [];
  for (let i = 0; i < bytes.length; i += 2) out.push(bytes[i] | (bytes[i + 1] << 8));
  return out;
};

/*
 * Verifikasi + hitung hadiah. → { ok, game, title, rows: [teks], rewards } | { ok:false, error }
 * Tidak mengubah apa pun selain menandai sesi / batas harian / catatan pemain ketika sukses.
 */
export const redeemGameCode = async (user, jid, raw) => {
  const parts = String(raw ?? "").replace(/[\s\u200b-\u200f\u2060\ufeff]+/g, "").split("~");
  parts[0] = (parts[0] ?? "").toLowerCase();
  parts[1] = (parts[1] ?? "").toLowerCase();
  const [tag, sid] = parts;
  const sess = sessions.get(sid);
  const gameOf = { 48: "2048", dino: "dino", aby: "abyss", chs: "chessai" }[tag];
  if (!gameOf) return null; // bukan kode game
  if (!sess || sess.game !== gameOf || sess.who !== jid) {
    return bad(tr("Kode ini bukan dari game milikmu atau sudah kedaluwarsa (maks 3 jam). Mainkan lagi gamenya.", "This code isn't from your game or it has expired (3 h max). Play the game again."));
  }
  if (todayCount(user, gameOf) >= DAILY[gameOf]) return bad(tr(`Batas klaim ${gameOf} hari ini (${DAILY[gameOf]}×) habis. Coba lagi besok.`, `Today's ${gameOf} claim limit (${DAILY[gameOf]}×) is used up. Try again tomorrow.`));

  /* 2048 */
  if (gameOf === "2048") {
    const dec = decode2048(parts[2]);
    if (!dec || dec.seed !== sess.seed || sess.used.has("done")) return bad(tr("Kode tidak valid atau sudah dipakai.", "Invalid or already used code."));
    const res = replay2048(dec.seed, dec.moves);
    if (!res.ok) return bad(tr("Permainan tidak lolos verifikasi.", "The game didn't pass verification."));
    if (res.score < MIN_2048) return bad(tr(`Skor ${res.score} masih di bawah minimal ${MIN_2048}.`, `Score ${res.score} is below the ${MIN_2048} minimum.`));
    sess.used.add("done"); bump(user, gameOf); stat(user, gameOf, { best: res.score });
    const rewards = { ...reward2048(res.score), ...(res.best >= 11 ? { diamond: 2 } : {}) };
    return { ok: true, game: gameOf, title: "🔢 2048", rows: [tr(`Skor *${res.score}* · ${res.moves} langkah · ubin tertinggi *${2 ** res.best}*`, `Score *${res.score}* · ${res.moves} moves · best tile *${2 ** res.best}*`)], rewards };
  }

  /* Dino */
  if (gameOf === "dino") {
    const [, , run, scoreRaw, msRaw, sig] = parts;
    const score = Number(scoreRaw), ms = Number(msRaw);
    if (!Number.isInteger(score) || !Number.isInteger(ms) || !/^\d+$/.test(run ?? "") || score < 0 || ms < 0) return bad(tr("Kode tidak valid.", "Invalid code."));
    if (sig !== cyrb53(`${sid}|${run}|${score}|${ms}|${sess.key}`)) return bad(tr("Tanda tangan kode salah — salin ulang utuh dari game.", "Bad code signature — copy it again in full from the game."));
    if (sess.used.has(run)) return bad(tr("Kode run ini sudah diklaim.", "This run was already redeemed."));
    if (score > ms * DINO_RATE + 8) return bad(tr("Skor tidak wajar untuk lama bermainnya.", "That score is too high for the time played."));
    if (sess.msUsed + ms > Date.now() - sess.at + 4000) return bad(tr("Waktu bermain tidak cocok dengan waktu nyata.", "Play time doesn't match real time."));
    if (score < DINO_MIN) return bad(tr(`Skor ${score} masih di bawah minimal ${DINO_MIN}.`, `Score ${score} is below the ${DINO_MIN} minimum.`));
    sess.used.add(run); sess.msUsed += ms; bump(user, gameOf); stat(user, gameOf, { best: score });
    return { ok: true, game: gameOf, title: "🦖 Hyrox Dino Runner", rows: [tr(`Skor *${score}* · ${Math.round(ms / 1000)} detik`, `Score *${score}* · ${Math.round(ms / 1000)} s`)], rewards: dinoReward(score) };
  }

  /* Abyss — kode: aby~<sesi>~<run>~<aksi>. Tiap run di sheet punya nomor sendiri (seed = seed sesi + run), jadi bisa main & klaim berkali-kali. */
  if (gameOf === "abyss") {
    const [, , runRaw, data] = parts, run = Number(runRaw);
    if (parts.length !== 4 || !Number.isInteger(run) || run < 1 || run > 99) return bad(tr("Kode Abyss tidak lengkap — salin ulang UTUH dari game (harus 4 bagian dipisah ~).", "Incomplete Abyss code — copy it again IN FULL from the game (4 parts separated by ~)."));
    if (sess.used.has(`r${run}`)) return bad(tr("Run ini sudah pernah diklaim. Mainkan run baru untuk kode baru.", "This run was already redeemed. Play a new run for a new code."));
    const E = engine("abyss"), actions = E.dec(data);
    if (!actions || !actions.length) return bad(tr("Isi kode rusak/terpotong — salin ulang UTUH dari game.", "The code body is corrupted/truncated — copy it again IN FULL from the game."));
    const res = E.replay({ ...sess.cfg, seed: (sess.cfg.seed + run) >>> 0 }, actions);
    if (!res.ok) { logger.warn(`redeem abyss: replay gagal (${res.error})`); return bad(tr("Permainan tidak lolos verifikasi.", "The run didn't pass verification.")); }
    if (!res.over) return bad(tr("Run belum selesai — selesaikan atau tekan Berhenti di game.", "The run isn't finished — finish it or press Retire in the game."));
    if (res.cleared < 1) return bad(tr("Kalahkan minimal lantai 1 untuk dapat hadiah.", "Clear at least floor 1 to earn a reward."));
    sess.used.add(`r${run}`); bump(user, gameOf); stat(user, gameOf, { best: res.cleared * 10 + res.diff, won: res.won ? 1 : 0 });
    return { ok: true, game: gameOf, title: "⚔️ Miyako Abyss", rows: [tr(`${E.CLASSES[res.cls].name} · ${E.DIFF[res.diff].name} · lantai *${res.cleared}/${E.FLOORS}* · ${res.won ? "🏆 MENANG" : res.retired ? "berhenti" : "gugur"}`, `${E.CLASSES[res.cls].name} · ${E.DIFF[res.diff].name} · floor *${res.cleared}/${E.FLOORS}* · ${res.won ? "🏆 VICTORY" : res.retired ? "retired" : "defeated"}`)], rewards: abyssReward(res) };
  }

  /* Catur vs AI — kode: chs~<sesi>~<level>~<w|b>~<game>~<langkah>. Tiap game di sheet punya nomor sendiri (seed = seed sesi + game). */
  const [, , levelRaw, sideRaw, gameRaw, moves] = parts, level = Number(levelRaw), gno = Number(gameRaw);
  const side = String(sideRaw).toLowerCase() === "w" ? 1 : String(sideRaw).toLowerCase() === "b" ? -1 : 0;
  if (parts.length !== 6 || !(level >= 1 && level <= 8) || !side || !Number.isInteger(gno) || gno < 1 || gno > 99) {
    logger.warn(`redeem chessai: format salah (${parts.length} bagian, level=${levelRaw}, sisi=${sideRaw}, game=${gameRaw})`);
    return bad(tr("Kode catur tidak lengkap — salin ulang UTUH dari game (harus 6 bagian dipisah ~).", "Incomplete chess code — copy it again IN FULL from the game (6 parts separated by ~)."));
  }
  if (sess.used.has(`g${gno}`)) return bad(tr("Game ini sudah pernah diklaim. Menangkan game baru untuk kode baru.", "This game was already redeemed. Win a new game for a new code."));
  const codes = decodeShorts(moves ?? "");
  if (!codes || !codes.length) return bad(tr("Isi kode rusak/terpotong — salin ulang UTUH dari game.", "The code body is corrupted/truncated — copy it again IN FULL from the game."));
  const res = await verifyChess({ seed: (sess.seed + gno) >>> 0, level, side }, codes);
  if (!res.ok) { logger.warn(`redeem chessai: replay gagal (${res.error})`); return bad(tr("Permainan tidak lolos verifikasi.", "The game didn't pass verification.")); }
  if (!res.over) return bad(tr("Permainan belum selesai.", "The game isn't finished."));
  const L = CHESS_LEVELS[level], prog = chessProgress(user);
  sess.used.add(`g${gno}`); bump(user, gameOf); stat(user, gameOf, { best: level });
  const rows = [tr(`Level *${level} · ${L.name}* — ${res.win ? "🏆 menang" : res.loss ? "❌ kalah" : "🤝 remis"} (${res.moves} langkah)`, `Level *${level} · ${L.name}* — ${res.win ? "🏆 win" : res.loss ? "❌ loss" : "🤝 draw"} (${res.moves} moves)`)];
  if (res.loss) { prog.loss++; return { ok: true, game: gameOf, title: "♟️ Chess vs AI", rows: [...rows, tr("Belum beruntung — coba lagi!", "Better luck next time!")], rewards: {} }; }
  if (res.moves < CHESS_MIN_MOVES) return { ok: true, game: gameOf, title: "♟️ Chess vs AI", rows: [...rows, tr(`Tanpa hadiah — minimal ${CHESS_MIN_MOVES} langkah.`, `No reward — at least ${CHESS_MIN_MOVES} moves needed.`)], rewards: {} };
  let rewards = chessWinReward(level);
  if (res.draw) {
    prog.draw++;
    rewards = { gold: Math.round(rewards.gold * 0.35), xp: Math.round(rewards.xp * 0.35) };
  } else {
    prog.win++;
    if (!prog.cleared[level]) {
      prog.cleared[level] = Date.now();
      rewards = mergeRewards(rewards, { gold: L.gold * 2, ...(L.first ?? {}) });
      rows.push(tr(`✨ Bonus clear pertama level ${level}!`, `✨ First-clear bonus for level ${level}!`));
    }
  }
  return { ok: true, game: gameOf, title: "♟️ Chess vs AI", rows, rewards };
};

export const gameSummary = (user) => {
  const g = user.games ?? {};
  return Object.keys(DAILY).map((k) => `${k}: ${g[k]?.plays ?? 0}× · ${dailyLeft(user, k)}/${DAILY[k]} ${tr("klaim tersisa", "claims left")}`);
};
export { fmt };
