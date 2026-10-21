import { readable } from "#lib/cards";
import { chessStore } from "#lib/chessgames";
import { config } from "#lib/config";
import { db } from "#lib/database";
import { botIdentities } from "#lib/groups";
import { logger } from "#lib/logger";
import { definePlugin } from "#lib/plugins";
import { PRIZE_MAX, PRIZE_MIN } from "#lib/prize";
import * as rpg from "#lib/rpg";
import { suitStore } from "#lib/suit";
import { fmt, tr } from "#lib/tr";
import * as U from "#lib/uno";
import { LOBBY_MS, PENDING_MS, TURN_MS, unoStore } from "#lib/unogames";
import { renderHand, renderTable } from "#lib/unoimg";
import { bare, dayKey, numberOf } from "#lib/utils";

/*
 * 🃏 UNO 2–10 pemain (khusus grup). Kartu tiap pemain dikirim lewat CHAT PRIBADI (gambar), meja ada di grup.
 *   Duel cepat : .uno @lawan → lawan jawab y/gas (terima) atau n/gamau (tolak) → langsung main berdua
 *   Ruang kode : .uno create [maks 2–10] → bot memberi KODE (mis. K7QM) → yang lain: .uno join K7QM → host: .uno start (min 2)
 *   Mainkan kartu: ketik kodenya di grup — r5 · gskip · brev · y+2 · w r · +4 b · draw · pass
 *   Lainnya    : .uno hand · board · room · leave · resign · abort · stats · help
 * Hadiah menang: Gold ACAK 500–2000 + 60 XP (+40% peluang peti kayu) — maks DAILY_WINS/hari dan ≥ MIN_PLAYS kartu dimainkan.
 * Pemain yang tidak bergerak TURN_MS dianggap keluar (game lanjut tanpa dia). Mesin: lib/uno.js (disimulasikan ribuan game).
 */
const ACCEPT = /^(y|gas|yes|oke)$/;
const DECLINE = /^(n|gak|no|gamau)$/;
const MIN_PLAYS = 8;
const DAILY_WINS = 10;
const CODE_RE = /^[a-z0-9]{4}$/i;

const tag = (p) => `@${numberOf(p.id)}`;
const short = (p) => readable(p.name, "Player").slice(0, 16);
const nameFor = (id, fallback) => { const u = db.users[id]; return u?.reg?.name ?? u?.name ?? fallback ?? numberOf(id); };
const identity = (ctx, name) => ({ id: ctx.senderId, pn: ctx.senderPn, lid: ctx.senderLid, name: name ?? nameFor(ctx.senderId, ctx.pushName) });
const mentionsOf = (g) => g.players.map((p) => p.id);
const tags = (g) => g.players.map(tag).join(", ");
const dmJid = (p) => p.pn ?? p.id;
const say = (g, text, extra = {}) => g.sock.sendMessage(g.chat, { text, mentions: mentionsOf(g), ...extra }).catch((err) => logger.warn(`UNO: failed to send (${err.message})`));
const wipe = (g, key) => { if (key) g.sock.sendMessage(key.remoteJid, { delete: key }).catch(() => {}); };
const colorName = (c) => tr(U.COLOR_ID[c], U.COLOR_EN[c]);
const label = (card) => `${U.COLOR_ICON[card.c]} ${U.cardCode(card)}`;
const cleanChat = () => config.features?.chessCleanChat !== false;

const tidy = async (env, text, ms = 6000) => {
  const { ctx, sock } = env;
  const sent = await ctx.reply(text, { preview: false }).catch(() => null);
  if (!cleanChat()) return sent;
  setTimeout(() => {
    if (ctx.raw?.key) sock.sendMessage(ctx.chatId, { delete: ctx.raw.key }).catch(() => {});
    if (sent?.key) sock.sendMessage(ctx.chatId, { delete: sent.key }).catch(() => {});
  }, ms).unref?.();
  return sent;
};
const arm = (g, ms, fn) => {
  clearTimeout(g.timer);
  g.timer = setTimeout(() => fn(g).catch((err) => logger.error(`UNO: ${err.stack ?? err.message}`)), ms);
  g.timer.unref?.();
};

const HELP = (p) => tr(
  `🃏 *UNO* — 2 sampai 10 pemain (kartu dikirim lewat chat pribadi)\n\n*Mulai main*\n› *${p}uno @tag* — duel cepat berdua (lawan jawab *y* / *gas* atau *n* / *gamau*)\n› *${p}uno create [2-10]* — buat ruang, bot memberi *KODE* (mis. K7QM)\n› *${p}uno join [KODE]* — gabung ruang · *${p}uno start* — host mulai (minimal 2 pemain)\n› *${p}uno room* — lihat ruang · *${p}uno leave* — keluar\n\n*Saat main* — ketik di grup:\n› Kartu: *r5*, *gskip*, *brev*, *y+2*, *w r* (wild + warna), *+4 b*\n   _warna: r merah · y kuning · g hijau · b biru — wild tanpa warna = warna terbanyak di tanganmu_\n› *draw* — ambil kartu · *pass* — lewati setelah ambil kartu\n› *${p}uno hand* — kirim ulang kartumu · *${p}uno board* — kirim ulang meja\n› *${p}uno resign* — menyerah/keluar · *${p}uno abort* — batalkan (sebelum jalan) · *${p}uno stats [@tag]*\n\n🎁 Menang: ${PRIZE_MIN}–${PRIZE_MAX} Gold acak + XP (+ peluang peti), maks ${DAILY_WINS}×/hari, minimal ${MIN_PLAYS} kartu dimainkan. Tidak bergerak ${TURN_MS / 60_000} menit = keluar otomatis.`,
  `🃏 *UNO* — 2 to 10 players (cards are sent in private chat)\n\n*Start a game*\n› *${p}uno @tag* — quick duel (they answer *y* / *gas* or *n* / *gamau*)\n› *${p}uno create [2-10]* — make a room, the bot gives a *CODE* (e.g. K7QM)\n› *${p}uno join [CODE]* — join a room · *${p}uno start* — host starts (at least 2 players)\n› *${p}uno room* — view the room · *${p}uno leave* — leave\n\n*In game* — type in the group:\n› Cards: *r5*, *gskip*, *brev*, *y+2*, *w r* (wild + color), *+4 b*\n   _colors: r red · y yellow · g green · b blue — a wild with no color = your most common color_\n› *draw* — draw a card · *pass* — skip after drawing\n› *${p}uno hand* — resend your cards · *${p}uno board* — resend the table\n› *${p}uno resign* — quit · *${p}uno abort* — cancel (before it gets going) · *${p}uno stats [@tag]*\n\n🎁 Win: random ${PRIZE_MIN}–${PRIZE_MAX} Gold + XP (+ crate chance), max ${DAILY_WINS}×/day, at least ${MIN_PLAYS} cards played. No move for ${TURN_MS / 60_000} min = you're out.`,
);

const turnLine = (g) => tr(
  `▶ Giliran ${tag(g.players[g.st.turn])} · warna ${U.COLOR_ICON[g.st.color]} ${colorName(g.st.color)}`,
  `▶ ${tag(g.players[g.st.turn])}'s turn · color ${U.COLOR_ICON[g.st.color]} ${colorName(g.st.color)}`,
);
const countsLine = (g) => `🎴 ${g.players.map((p, i) => `${tag(p)} ${g.st.hands[i].length}`).join(" · ")}`;

/* ── kirim gambar ────────────────────────────────────────────────────────── */
const sendTable = async (g, caption, { over = false, status } = {}) => {
  const st = g.st, prev = g.tableKey;
  let image = null;
  try {
    image = await renderTable({
      top: U.top(st), color: st.color, turn: st.turn, dir: st.dir, drawLeft: st.draw.length, over,
      players: g.players.map((p, i) => ({ name: short(p), count: st.hands[i].length })),
      status: status ?? tr(`Giliran ${short(g.players[st.turn])}`, `${short(g.players[st.turn])}'s turn`), last: g.last.replace(/\*/g, ""),
    });
  } catch (err) {
    logger.warn(`UNO: table image failed (${err.message})`);
  }
  const text = `${caption}\n${countsLine(g)}`;
  let sent = null;
  try {
    sent = image ? await g.sock.sendMessage(g.chat, { image, caption: text, mentions: mentionsOf(g) }) : await g.sock.sendMessage(g.chat, { text, mentions: mentionsOf(g) });
  } catch (err) {
    logger.warn(`UNO: failed to send table (${err.message})`);
  }
  g.tableKey = over || !sent?.key ? null : sent.key;
  if (prev && sent?.key) wipe(g, prev);
  return !!sent?.key;
};

// Tangan pemain → chat pribadi. Gambar sebelumnya dihapus supaya DM tidak penuh. → true bila terkirim
const sendHand = async (g, side, { newest = null } = {}) => {
  const st = g.st, p = g.players[side], mine = st.turn === side && st.winner === null;
  const playable = mine ? new Set(U.playableCards(st, side).map(U.cardCode)) : null;
  try {
    const image = await renderHand(st.hands[side], {
      playable, newest,
      title: tr(`${short(p)} — kartumu`, `${short(p)} — your hand`),
      subtitle: mine
        ? tr(`Giliranmu · atas: ${label(U.top(st))} · warna ${colorName(st.color)} · garis emas = bisa dimainkan`, `Your turn · top: ${label(U.top(st))} · color ${colorName(st.color)} · gold = playable`)
        : tr("Menunggu giliranmu…", "Waiting for your turn…"),
    });
    const codes = st.hands[side].map(U.cardCode).join("  ");
    const caption = mine
      ? tr(`🃏 *Giliranmu!* Ketik di grup, mis. *${[...playable][0] ?? "draw"}*${st.drew ? ` _(kartu yang baru kamu ambil / *pass*)_` : ""}\n\n${codes}`, `🃏 *Your turn!* Type in the group, e.g. *${[...playable][0] ?? "draw"}*${st.drew ? ` _(the card you just drew / *pass*)_` : ""}\n\n${codes}`)
      : tr(`🃏 Kartumu (${st.hands[side].length}):\n${codes}`, `🃏 Your cards (${st.hands[side].length}):\n${codes}`);
    const sent = await g.sock.sendMessage(dmJid(p), { image, caption });
    const prev = g.handKeys[side];
    g.handKeys[side] = sent?.key ?? null;
    wipe(g, prev);
    return true;
  } catch (err) {
    logger.warn(`UNO: failed to DM hand (${err.message})`);
    return false;
  }
};

/* ── teks aksi ───────────────────────────────────────────────────────────── */
const describe = (g, ev) => {
  const who = tag(g.players[ev.side]);
  if (ev.type === "pass") return tr(`⏭️ ${who} pass.`, `⏭️ ${who} passed.`);
  if (ev.type === "draw") {
    if (!ev.card) return tr(`🎴 ${who} ingin ambil kartu, tapi tumpukan habis — giliran lewat.`, `🎴 ${who} tried to draw but the pile is empty — turn passes.`);
    return ev.playable
      ? tr(`🎴 ${who} ambil 1 kartu — bisa dimainkan! (mainkan atau *pass*)`, `🎴 ${who} drew a card — it's playable! (play it or *pass*)`)
      : tr(`🎴 ${who} ambil 1 kartu & tidak bisa dimainkan — giliran lewat.`, `🎴 ${who} drew a card, can't play it — turn passes.`);
  }
  const bits = [tr(`${who} mainkan ${label(ev.card)}`, `${who} played ${label(ev.card)}`)];
  if (U.isWild(ev.card)) bits[0] += ` → ${U.COLOR_ICON[ev.color]} ${colorName(ev.color)}`;
  if (ev.reversed) bits.push(tr("🔄 arah berbalik", "🔄 direction reversed"));
  if (ev.victim !== null) bits.push(tr(`💥 ${tag(g.players[ev.victim])} ambil ${ev.drawn} kartu & dilewati`, `💥 ${tag(g.players[ev.victim])} draws ${ev.drawn} and is skipped`));
  else if (ev.skipped !== null) bits.push(tr(`⛔ ${tag(g.players[ev.skipped])} dilewati`, `⛔ ${tag(g.players[ev.skipped])} is skipped`));
  return bits.join(" · ");
};

/* ── akhir permainan ─────────────────────────────────────────────────────── */
const record = (p, key) => {
  const u = db.user(p.id, p.name);
  u.uno ??= { win: 0, loss: 0 };
  u.uno[key]++;
  return u;
};

const finish = async (g, { winner, text, status }) => {
  unoStore.remove(g);
  const win = g.players[winner];
  const lines = [text];
  const wu = record(win, "win");
  g.players.forEach((p, i) => { if (i !== winner) record(p, "loss"); });
  const today = dayKey(config.timezone);
  if (wu.unoDaily?.day !== today) wu.unoDaily = { day: today, n: 0 };
  if (g.st.plays < MIN_PLAYS) lines.push(tr(`ℹ️ Tanpa hadiah — permainan butuh minimal ${MIN_PLAYS} kartu dimainkan.`, `ℹ️ No reward — the game needs at least ${MIN_PLAYS} cards played.`));
  else if (wu.unoDaily.n >= DAILY_WINS) lines.push(tr(`ℹ️ ${tag(win)} sudah mencapai batas hadiah UNO hari ini (${DAILY_WINS}×).`, `ℹ️ ${tag(win)} reached today's UNO reward limit (${DAILY_WINS}×).`));
  else {
    wu.unoDaily.n++;
    const r = rpg.unoReward(rpg.getRpg(wu));
    lines.push(`🎁 ${tag(win)}: +${fmt(r.gold)} Gold · +${r.xp} XP${r.item ? ` · 🎁 ${rpg.ITEMS[r.item].name}` : ""}`);
  }
  db.save("users");
  g.last = text.replace(/\*/g, "").split("\n")[0];
  await sendTable(g, lines.join("\n"), { over: true, status });
  for (const key of g.handKeys) wipe(g, key);
};

// Pemain keluar (menyerah / habis waktu): 2 pemain → lawan menang; 3+ → game lanjut tanpa dia.
const forfeit = async (g, side, why) => {
  const p = g.players[side];
  const text = why === "timeout"
    ? tr(`⌛ ${tag(p)} tidak bergerak ${TURN_MS / 60_000} menit — keluar dari game.`, `⌛ ${tag(p)} didn't move for ${TURN_MS / 60_000} min — out of the game.`)
    : tr(`🏳️ ${tag(p)} menyerah.`, `🏳️ ${tag(p)} resigned.`);
  if (g.players.length <= 2) {
    const winner = 1 - side;
    return finish(g, { winner, text: `${text}\n${tr(`🏆 ${tag(g.players[winner])} menang!`, `🏆 ${tag(g.players[winner])} wins!`)}`, status: tr("MENANG!", "WINNER!") });
  }
  const wasTurn = side === g.st.turn;
  record(p, "loss");
  db.save("users");
  wipe(g, g.handKeys[side]);
  g.handKeys.splice(side, 1);
  U.removePlayer(g.st, side);
  g.players.splice(side, 1);
  g.last = text.replace(/\*/g, "");
  if (wasTurn) arm(g, TURN_MS, (x) => forfeit(x, x.st.turn, "timeout"));
  await sendTable(g, `${text}\n${turnLine(g)}`);
  if (wasTurn) await sendHand(g, g.st.turn);
};

const abandon = async (g) => {
  const hostTag = tag(g.players[0]);
  unoStore.remove(g);
  if (g.state === "pending") return say(g, tr(`⌛ ${tag(g.players[1])} tidak merespon. Tantangan UNO dari ${hostTag} hangus.`, `⌛ ${tag(g.players[1])} didn't respond. ${hostTag}'s UNO challenge expired.`));
  return say(g, tr(`⌛ Ruang UNO *${g.code}* ditutup (tidak dimulai dalam ${LOBBY_MS / 60_000} menit).`, `⌛ UNO room *${g.code}* closed (not started within ${LOBBY_MS / 60_000} min).`));
};

/* ── gerakan ─────────────────────────────────────────────────────────────── */
const ERRORS = {
  turn: () => tr("⏳ Bukan giliranmu.", "⏳ It's not your turn."),
  over: () => tr("🃏 Permainan sudah selesai.", "🃏 The game is over."),
  nocard: (g, cmd) => tr(`❌ Kamu tidak punya kartu *${cmd}*. Cek chat pribadi (atau *${g.prefix}uno hand*).`, `❌ You don't have *${cmd}*. Check your private chat (or *${g.prefix}uno hand*).`),
  illegal: (g) => tr(`❌ Kartu tidak cocok. Harus warna ${U.COLOR_ICON[g.st.color]} ${colorName(g.st.color)} atau sama dengan ${label(U.top(g.st))}. Tidak ada? ketik *draw*.`, `❌ That card doesn't match. It must be ${U.COLOR_ICON[g.st.color]} ${colorName(g.st.color)} or match ${label(U.top(g.st))}. None? type *draw*.`),
  wild4: (g) => tr(`❌ +4 hanya boleh kalau kamu tidak punya kartu warna ${U.COLOR_ICON[g.st.color]} ${colorName(g.st.color)}.`, `❌ +4 is only allowed when you have no ${U.COLOR_ICON[g.st.color]} ${colorName(g.st.color)} card.`),
  drewOnly: () => tr("❌ Setelah ambil kartu, hanya kartu itu yang boleh dimainkan — atau ketik *pass*.", "❌ After drawing, you may only play that card — or type *pass*."),
  alreadyDrew: () => tr("❌ Kamu sudah ambil kartu — mainkan kartunya atau ketik *pass*.", "❌ You already drew — play that card or type *pass*."),
  mustDraw: () => tr("❌ Kamu belum ambil kartu. Ketik *draw*.", "❌ You haven't drawn. Type *draw*."),
};

const afterMove = async (g, ev) => {
  g.last = describe(g, ev);
  arm(g, TURN_MS, (x) => forfeit(x, x.st.turn, "timeout"));
  if (g.st.winner !== null) {
    const winner = g.st.winner;
    return finish(g, { winner, text: tr(`🏆 *UNO!* ${tag(g.players[winner])} menang — kartu habis!\n${g.last}`, `🏆 *UNO!* ${tag(g.players[winner])} wins — out of cards!\n${g.last}`), status: tr("MENANG!", "WINNER!") });
  }
  const uno = ev.uno ? tr(`\n🔔 *UNO!* ${tag(g.players[ev.side])} tinggal 1 kartu!`, `\n🔔 *UNO!* ${tag(g.players[ev.side])} has 1 card left!`) : "";
  await sendTable(g, `${turnLine(g)}\n${g.last}${uno}`);
  const mover = g.st.turn;
  await sendHand(g, mover, { newest: ev.type === "draw" && ev.side === mover ? ev.card : null });
};

const playInput = async (env, g, parsed, { quiet = false } = {}) => {
  const { ctx, sock } = env, side = unoStore.sideOf(g, ctx);
  if (side === null) return;
  if (g.st.turn !== side) return quiet ? undefined : tidy(env, ERRORS.turn());
  const out = parsed.type === "draw" ? U.draw(g.st, side) : parsed.type === "pass" ? U.pass(g.st, side) : U.play(g.st, side, parsed);
  if (out.error) return tidy(env, ERRORS[out.error](g, ctx.text?.trim().slice(0, 12) ?? ""));
  if (cleanChat() && ctx.raw?.key) sock.sendMessage(ctx.chatId, { delete: ctx.raw.key }).catch(() => {});
  await afterMove(g, out.ev);
};

/* ── mulai / ruang ───────────────────────────────────────────────────────── */
const startGame = async (g) => {
  clearTimeout(g.timer);
  g.st = U.newGame(g.players.length);
  g.state = "playing";
  g.handKeys = g.players.map(() => null);
  // tangan harus sampai ke chat pribadi SEMUA pemain — kalau ada yang tidak bisa, batalkan (tanpa kartu tidak bisa main)
  const ok = await Promise.all(g.players.map((_, i) => sendHand(g, i)));
  if (!ok.every(Boolean)) {
    unoStore.remove(g);
    for (const key of g.handKeys) wipe(g, key);
    const bad = g.players.filter((_, i) => !ok[i]);
    return say(g, tr(`❌ Bot tidak bisa mengirim kartu ke chat pribadi ${bad.map(tag).join(" & ")}. Chat bot dulu (ketik apa saja di pribadi), lalu mulai ulang.`, `❌ The bot couldn't DM cards to ${bad.map(tag).join(" & ")}. Message the bot privately first (anything), then start again.`));
  }
  arm(g, TURN_MS, (x) => forfeit(x, x.st.turn, "timeout"));
  g.last = tr("Kartu dibagikan — 7 per pemain.", "Cards dealt — 7 each.");
  await sendTable(g, tr(`🃏 *UNO dimulai!* (${g.players.length} pemain)\n${tags(g)}\nKartu dikirim lewat *chat pribadi* ✉️\n\n${turnLine(g)}\nKartu teratas: ${label(U.top(g.st))}`, `🃏 *UNO started!* (${g.players.length} players)\n${tags(g)}\nCards were sent in *private chat* ✉️\n\n${turnLine(g)}\nTop card: ${label(U.top(g.st))}`));
};

const roomText = (g, p) => tr(
  `🃏 *RUANG UNO* — kode *${g.code}*\n👥 Pemain (${g.players.length}/${g.max}): ${tags(g)}\n\n➕ Gabung: *${p}uno join ${g.code}*\n▶️ Host (${tag(g.players[0])}) mulai: *${p}uno start* — minimal 2 pemain\n🎁 Pemenang dapat ${PRIZE_MIN}–${PRIZE_MAX} Gold (acak)\n⌛ Ruang ditutup ${LOBBY_MS / 60_000} menit jika tidak dimulai.`,
  `🃏 *UNO ROOM* — code *${g.code}*\n👥 Players (${g.players.length}/${g.max}): ${tags(g)}\n\n➕ Join: *${p}uno join ${g.code}*\n▶️ Host (${tag(g.players[0])}) starts: *${p}uno start* — at least 2 players\n🎁 The winner gets ${PRIZE_MIN}–${PRIZE_MAX} Gold (random)\n⌛ The room closes in ${LOBBY_MS / 60_000} min if not started.`,
);

const acceptDuel = async (env, g) => {
  Object.assign(g.players[1], identity(env.ctx));
  await startGame(g);
};
const declineDuel = async (g) => {
  unoStore.remove(g);
  await say(g, tr(`❌ ${tag(g.players[1])} menolak tantangan UNO dari ${tag(g.players[0])}.`, `❌ ${tag(g.players[1])} declined ${tag(g.players[0])}'s UNO challenge.`));
};

const busy = (jid) => unoStore.ofJid(jid) || chessStore.ofJid(jid) || suitStore.ofJid(jid);

/* ── command ─────────────────────────────────────────────────────────────── */
export default definePlugin({
  name: "uno",
  aliases: ["unogame"],
  category: "game",
  ownHelp: true,
  access: { group: true },
  description: "UNO 2–10 players: duel with @tag or room with a code — cards in private chat, random 500–2000 Gold prize",
  usage: "uno @tag · uno create [2-10] · uno join <kode> · uno start",
  async run(env) {
    const { ctx, sock } = env, p = ctx.pfx;
    let sub = (ctx.args[0] ?? "").toLowerCase();
    // kode ruangan langsung: ".uno K7QM" = ".uno join K7QM"
    if (ctx.args.length === 1 && CODE_RE.test(ctx.args[0]) && unoStore.byCode(ctx.args[0])) { ctx.args.unshift("join"); sub = "join"; }
    const mine = unoStore.ofPlayer(ctx);
    const here = mine && mine.chat === ctx.chatId && mine.state === "playing" ? mine : null;
    const noGame = () => ctx.reply(tr("🃏 Kamu tidak punya permainan UNO aktif di chat ini.", "🃏 You have no active UNO game in this chat."));

    if (sub === "help") return ctx.reply(HELP(p));

    if (sub === "stats" || sub === "rekor") {
      const id = ctx.mentionedJid[0] ?? ctx.quotedSender ?? ctx.senderId;
      const c = db.users[id]?.uno ?? { win: 0, loss: 0 };
      return ctx.reply(tr(`🃏 *Rekor UNO* — @${numberOf(id)}\n🏆 Menang: ${c.win}  ·  ❌ Kalah: ${c.loss}`, `🃏 *UNO record* — @${numberOf(id)}\n🏆 Wins: ${c.win}  ·  ❌ Losses: ${c.loss}`), { mentions: [id] });
    }

    /* ── ruang berkode ── */
    if (["create", "room", "buat", "ruang", "new"].includes(sub) && !(sub === "room" && mine)) {
      if (mine) return ctx.reply(tr(`⏳ Kamu masih ada di permainan/ruang UNO. Selesaikan atau pakai *${p}uno leave*.`, `⏳ You're still in a UNO game/room. Finish it or use *${p}uno leave*.`));
      if (busy(ctx.senderId)) return ctx.reply(tr("⏳ Kamu sedang bermain game lain.", "⏳ You're in another game."));
      const wanted = ctx.args[1] === undefined ? U.MAX_PLAYERS : Number(ctx.args[1]);
      if (!Number.isInteger(wanted) || wanted < U.MIN_PLAYERS || wanted > U.MAX_PLAYERS) return ctx.reply(tr(`❌ Jumlah pemain harus ${U.MIN_PLAYERS}–${U.MAX_PLAYERS}. Contoh: *${p}uno create 4*`, `❌ Player count must be ${U.MIN_PLAYERS}–${U.MAX_PLAYERS}. Example: *${p}uno create 4*`));
      const g = unoStore.create({ kind: "room", state: "lobby", chat: ctx.chatId, sock, prefix: p, max: wanted, players: [identity(ctx)] });
      arm(g, LOBBY_MS, abandon);
      return ctx.reply(roomText(g, p), { mentions: mentionsOf(g) });
    }

    if (sub === "join" || sub === "gabung" || sub === "ikut") {
      if (mine) return ctx.reply(tr(`⏳ Kamu sudah ada di permainan/ruang UNO (*${mine.code}*).`, `⏳ You're already in a UNO game/room (*${mine.code}*).`));
      if (busy(ctx.senderId)) return ctx.reply(tr("⏳ Kamu sedang bermain game lain.", "⏳ You're in another game."));
      const code = ctx.args[1];
      let g = code ? unoStore.byCode(code) : null;
      if (!code) {
        const open = unoStore.lobbiesIn(ctx.chatId);
        if (open.length === 1) [g] = open;
        else if (open.length > 1) return ctx.reply(tr(`❓ Ada ${open.length} ruang: ${open.map((x) => `*${x.code}*`).join(", ")}. Ketik *${p}uno join <KODE>*.`, `❓ There are ${open.length} rooms: ${open.map((x) => `*${x.code}*`).join(", ")}. Type *${p}uno join <CODE>*.`));
        else return ctx.reply(tr(`❌ Belum ada ruang UNO di grup ini. Buat dengan *${p}uno create*.`, `❌ No UNO room in this group yet. Make one with *${p}uno create*.`));
      }
      if (!g) return ctx.reply(tr(`❌ Kode *${String(code).toUpperCase()}* tidak ditemukan atau ruangnya sudah mulai.`, `❌ Code *${String(code).toUpperCase()}* wasn't found or the room already started.`));
      if (g.chat !== ctx.chatId) return ctx.reply(tr("❌ Ruang itu ada di grup lain — gabung dari grup tempat ruangnya dibuat.", "❌ That room is in another group — join from the group where it was made."));
      if (g.players.length >= g.max) return ctx.reply(tr(`❌ Ruang *${g.code}* sudah penuh (${g.max}).`, `❌ Room *${g.code}* is full (${g.max}).`));
      g.players.push(identity(ctx));
      if (g.players.length >= g.max) { await say(g, tr(`✅ ${tag(g.players.at(-1))} bergabung — ruang penuh, game dimulai!`, `✅ ${tag(g.players.at(-1))} joined — the room is full, starting!`)); return startGame(g); }
      return ctx.reply(roomText(g, p), { mentions: mentionsOf(g) });
    }

    if (sub === "start" || sub === "mulai") {
      const lobby = mine?.state === "lobby" ? mine : null;
      if (!lobby || lobby.chat !== ctx.chatId) return ctx.reply(tr(`❌ Kamu tidak punya ruang UNO yang menunggu. Buat dengan *${p}uno create*.`, `❌ You have no waiting UNO room. Make one with *${p}uno create*.`));
      if (unoStore.sideOf(lobby, ctx) !== 0) return ctx.reply(tr(`❌ Hanya host (${tag(lobby.players[0])}) yang bisa memulai.`, `❌ Only the host (${tag(lobby.players[0])}) can start.`));
      if (lobby.players.length < U.MIN_PLAYERS) return ctx.reply(tr(`❌ Minimal ${U.MIN_PLAYERS} pemain. Bagikan kode *${lobby.code}* — mereka ketik *${p}uno join ${lobby.code}*.`, `❌ At least ${U.MIN_PLAYERS} players needed. Share code *${lobby.code}* — they type *${p}uno join ${lobby.code}*.`));
      return startGame(lobby);
    }

    if (sub === "room" || sub === "info") {
      const lobby = mine?.state === "lobby" ? mine : unoStore.lobbiesIn(ctx.chatId)[0];
      if (lobby) return ctx.reply(roomText(lobby, p), { mentions: mentionsOf(lobby) });
      if (here) return sendTable(here, `${turnLine(here)}${here.last ? `\n${here.last}` : ""}`);
      return ctx.reply(tr(`❌ Belum ada ruang UNO. Buat dengan *${p}uno create*.`, `❌ No UNO room yet. Make one with *${p}uno create*.`));
    }

    if (sub === "leave" || sub === "keluar") {
      if (!mine) return noGame();
      if (mine.state === "playing") return forfeit(mine, unoStore.sideOf(mine, ctx), "resign");
      const side = unoStore.sideOf(mine, ctx);
      if (side === 0 || mine.state === "pending") { unoStore.remove(mine); return say(mine, tr(`🚪 ${tag(mine.players[0])} menutup ruang UNO *${mine.code}*.`, `🚪 ${tag(mine.players[0])} closed UNO room *${mine.code}*.`)); }
      const [gone] = mine.players.splice(side, 1);
      return ctx.reply(`${tr(`🚪 ${tag(gone)} keluar.`, `🚪 ${tag(gone)} left.`)}\n\n${roomText(mine, p)}`, { mentions: [gone.id, ...mentionsOf(mine)] });
    }

    if (["abort", "cancel", "batal"].includes(sub)) {
      if (!mine) return noGame();
      if (mine.state === "playing" && mine.st.plays >= mine.players.length) return ctx.reply(tr(`🚫 Permainan sudah berjalan — pakai *${p}uno resign*.`, `🚫 The game is already underway — use *${p}uno resign*.`));
      if (mine.state !== "pending" && unoStore.sideOf(mine, ctx) !== 0) return ctx.reply(tr(`❌ Hanya host (${tag(mine.players[0])}) yang bisa membatalkan. Kamu bisa *${p}uno leave*.`, `❌ Only the host (${tag(mine.players[0])}) can cancel. You can *${p}uno leave*.`));
      unoStore.remove(mine);
      for (const key of mine.handKeys) wipe(mine, key);
      return say(mine, tr("🚫 Permainan UNO dibatalkan.", "🚫 The UNO game was cancelled."));
    }

    if (["resign", "surrender", "menyerah"].includes(sub)) {
      if (!here) return noGame();
      return forfeit(here, unoStore.sideOf(here, ctx), "resign");
    }

    if (["hand", "kartu"].includes(sub)) {
      if (!here) return noGame();
      const ok = await sendHand(here, unoStore.sideOf(here, ctx));
      return ok ? ctx.reply(tr("📩 Kartumu dikirim ke chat pribadi.", "📩 Your cards were sent to your private chat.")) : ctx.reply(tr("❌ Bot tidak bisa mengirim chat pribadi. Chat bot dulu (ketik apa saja di pribadi), lalu ulangi.", "❌ The bot can't DM you. Message the bot privately first, then try again."));
    }

    if (sub === "board" || sub === "show") {
      if (!here) return noGame();
      if (Date.now() - (here.boardCmdAt ?? 0) < 15_000) return tidy(env, tr("⏳ Meja baru saja dikirim — tunggu sebentar.", "⏳ The table was just sent — wait a moment."), 4000);
      here.boardCmdAt = Date.now();
      return sendTable(here, `${turnLine(here)}${here.last ? `\n${here.last}` : ""}`);
    }

    // .uno draw / .uno pass / .uno <kartu> / .uno play <kartu>
    const inputText = ["play", "main"].includes(sub) ? ctx.args.slice(1).join(" ") : ctx.args.join(" ");
    const targetId = ctx.mentionedJid[0] ?? (ctx.args.length ? null : ctx.quotedSender);
    const parsed = !targetId ? U.parseInput(inputText) : null;
    if (parsed) {
      if (!here) return noGame();
      return playInput(env, here, parsed);
    }

    // duel: .uno @tag
    if (!targetId) return ctx.reply(tr("❓ Perintah UNO tidak jelas. Ini semua perintahnya:\n\n", "❓ Unclear UNO command. Here are all of them:\n\n") + HELP(p));
    if ([ctx.senderId, ctx.senderPn, ctx.senderLid].filter(Boolean).map(bare).includes(bare(targetId))) return ctx.reply(tr("😅 Tidak bisa main UNO lawan diri sendiri. Tag pemain lain.", "😅 You can't play UNO against yourself. Tag another player."));
    if (botIdentities(sock).includes(bare(targetId))) return ctx.reply(tr("🤖 Bot tidak ikut main UNO. Tag pemain lain.", "🤖 The bot doesn't play UNO. Tag another player."));
    if (mine) return ctx.reply(tr(`⏳ Kamu masih dalam permainan/ruang UNO. Selesaikan atau pakai *${p}uno leave*.`, `⏳ You're still in a UNO game/room. Finish it or use *${p}uno leave*.`));
    if (busy(targetId) || busy(ctx.senderId)) return ctx.reply(tr("⏳ Kamu atau lawanmu sedang bermain game lain.", "⏳ You or your opponent is in another game."));

    const g = unoStore.create({ kind: "duel", state: "pending", chat: ctx.chatId, sock, prefix: p, max: 2, players: [identity(ctx), { id: targetId, name: nameFor(targetId) }] });
    arm(g, PENDING_MS, abandon);
    await ctx.reply(tr(
      `🃏 *UNO — duel*\n${tag(g.players[0])} menantang ${tag(g.players[1])}!\n🎁 Pemenang dapat ${PRIZE_MIN}–${PRIZE_MAX} Gold (acak)\n\n${tag(g.players[1])}, jawab dalam ${PENDING_MS / 1000} detik:\n✅ Terima → *y* / *gas* / *yes* / *oke*\n❌ Tolak → *n* / *gak* / *no* / *gamau*\n\n_Mau main ramai-ramai? *${p}uno create*_`,
      `🃏 *UNO — duel*\n${tag(g.players[0])} challenges ${tag(g.players[1])}!\n🎁 The winner gets ${PRIZE_MIN}–${PRIZE_MAX} Gold (random)\n\n${tag(g.players[1])}, answer within ${PENDING_MS / 1000}s:\n✅ Accept → *y* / *gas* / *yes* / *oke*\n❌ Decline → *n* / *gak* / *no* / *gamau*\n\n_Want a bigger game? *${p}uno create*_`,
    ), { mentions: mentionsOf(g) });
  },

  // Jawaban tantangan duel + kartu yang diketik biasa di grup.
  async passive(env) {
    const { ctx } = env;
    if (ctx.fromMe || ctx.isCmd || !ctx.text || !ctx.isGroup) return;
    const text = ctx.text.trim();
    if (text.length > 14) return;

    const pending = unoStore.pendingFor(ctx.chatId, ctx);
    if (pending) {
      const word = text.toLowerCase().replace(/[.!?\s]+$/g, "");
      if (ACCEPT.test(word)) return acceptDuel(env, pending);
      if (DECLINE.test(word)) return declineDuel(pending);
      return;
    }
    const g = unoStore.playing(ctx.chatId, ctx);
    if (!g || g.st.turn !== unoStore.sideOf(g, ctx)) return;
    if (/^(d|w|p)$/i.test(text)) return; // satu huruf terlalu mudah kebetulan terketik saat ngobrol
    const parsed = U.parseInput(text);
    if (!parsed) return;
    return playInput(env, g, parsed, { quiet: true });
  },
});
