import { botIdentities } from "#lib/groups";
import { db } from "#lib/database";
import { sendInteractive } from "#lib/interactive";
import { logger } from "#lib/logger";
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
const betText = (g) => (g.bet ? `💰 Taruhan: *${fmt(g.bet)} Gold*` : "💰 Tanpa taruhan");

const say = (g, text, extra = {}) => g.sock.sendMessage(g.chat, { text, mentions: mentionsOf(g), ...extra }).catch((err) => logger.warn(`Suit PvP: gagal kirim ke grup (${err.message})`));
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
  const text = [
    `✊✌️✋ *SUIT PVP* — Ronde ${g.round}/${MAX_ROUNDS}`,
    `Lawan: *${foe.name}*`,
    betText(g),
    "",
    `Pilih suitmu — *rahasia*, lawan tidak melihat. Waktu ${PICK_MS / 1000} detik.`,
    "Tekan tombol di bawah, atau ketik: batu / gunting / kertas",
  ].join("\n");
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
    await say(g, `⚠️ Bot tidak bisa mengirim chat pribadi ke ${failed.map((s) => tag(g[s])).join(" & ")}.\nChat bot dulu lewat pribadi (ketik *${g.prefix}menu*), lalu tantang lagi.`);
  }
};

const expirePending = async (g) => {
  if (g.state !== "pending") return;
  suitStore.remove(g);
  await say(g, `⌛ ${tag(g.b)} tidak merespon. Tantangan suit dari ${tag(g.a)} dibatalkan.`);
};

const expirePick = async (g) => {
  if (g.state !== "picking") return;
  const waiting = ["a", "b"].filter((s) => !g.picks[s]);
  suitStore.remove(g);
  await say(g, `⌛ Waktu habis — ${waiting.map((s) => tag(g[s])).join(" & ")} belum memilih.\nSuit dibatalkan, tidak ada gold yang berpindah.`);
};

const accept = async (env, g) => {
  const { ctx } = env;
  Object.assign(g.b, { id: ctx.senderId, pn: ctx.senderPn, lid: ctx.senderLid, name: nameFor(ctx.senderId, ctx.pushName) });
  g.state = "picking";
  clearTimeout(g.timer);
  await say(g, [`✅ ${tag(g.b)} menerima tantangan ${tag(g.a)}!`, betText(g), "", "📩 Cek *chat pribadi* dari bot untuk memilih suit (rahasia)."].join("\n"));
  await startRound(g);
};

const decline = async (env, g) => {
  suitStore.remove(g);
  await say(g, `❌ ${tag(g.b)} menolak tantangan suit dari ${tag(g.a)}.`);
};

const reveal = async (env, g) => {
  g.state = "reveal";
  clearTimeout(g.timer);
  const head = (n) => `✅ *Pemilihan selesai!*\n⏳ Hasil keluar dalam *${n}*...`;
  const first = await say(g, head(3));
  const key = first?.key;
  for (const n of [2, 1]) {
    await sleep(1000);
    if (key) await g.sock.sendMessage(g.chat, editPayload(key, head(n), { mentions: mentionsOf(g) })).catch(() => {});
  }
  await sleep(1000);

  const { a: pa, b: pb } = g.picks, S = game.SUIT, result = game.suitWinner(pa, pb);
  const recap = (side, line) => dm(g, side, [`🎮 *HASIL SUIT PVP*`, `Kamu   : ${S[g.picks[side]].icon} ${S[g.picks[side]].name}`, `Lawan  : ${S[g.picks[sideName(side)]].icon} ${S[g.picks[sideName(side)]].name}`, "", line].join("\n"));
  const edit = (text) => (key ? g.sock.sendMessage(g.chat, editPayload(key, text, { mentions: mentionsOf(g) })).catch(() => {}) : say(g, text));

  // Seri → ulang (maks 3 ronde).
  if (result === 0) {
    if (g.round < MAX_ROUNDS) {
      await edit(`🤝 *SERI!* Sama-sama memilih ${S[pa].icon} ${S[pa].name}.\n🔁 Ronde ${g.round + 1}/${MAX_ROUNDS} — pilih lagi di chat pribadi.`);
      await Promise.all([recap("a", "🤝 Seri — pilih ulang!"), recap("b", "🤝 Seri — pilih ulang!")]);
      g.round++;
      return startRound(g);
    }
    for (const side of ["a", "b"]) { game.getRpg(db.user(g[side].id, g[side].name)).pvp.suitDraw++; }
    db.save("users");
    suitStore.remove(g);
    await edit(`🤝 *SERI ${MAX_ROUNDS}x berturut-turut!* ${tag(g.a)} & ${tag(g.b)} sama kuat.\nTidak ada pemenang, tidak ada gold yang berpindah.`);
    await Promise.all([recap("a", "🤝 Seri total."), recap("b", "🤝 Seri total.")]);
    return;
  }

  const ws = result === 1 ? "a" : "b", ls = sideName(ws), wp = g[ws], lp = g[ls];
  const wr = game.getRpg(db.user(wp.id, wp.name)), lr = game.getRpg(db.user(lp.id, lp.name));
  const settle = game.suitSettle(wr, lr, g.bet);
  db.save("users");
  suitStore.remove(g);

  await edit(`🎉 *Congratulations......* ${tag(wp)}!\n${S[g.picks[ws]].icon} ${S[g.picks[ws]].name} mengalahkan ${S[g.picks[ls]].icon} ${S[g.picks[ls]].name}`);
  await sendResult(groupEnv(env, g, wp), wr, {
    title: "SUIT PVP",
    subtitle: `${wp.name} mengalahkan ${lp.name}`,
    badge: "MENANG",
    accent: "0xffd566",
    rows: [{ icon: "sword", text: `${S[g.picks[ws]].name} mengalahkan ${S[g.picks[ls]].name}`, sub: `${wp.name} vs ${lp.name} · ronde ${g.round}` }, ...settle.winRows],
    ok: true,
  }, [lp.id]);
  await Promise.all([
    recap(ws, `🎉 Kamu *MENANG*!${settle.stake ? ` +${fmt(settle.stake)} Gold taruhan.` : ""} +${fmt(settle.bonus)} Gold bonus.`),
    recap(ls, `😢 Kamu *KALAH*.${settle.stake ? ` -${fmt(settle.stake)} Gold taruhan.` : ""} Coba lagi!`),
  ]);
};

// Dipanggil dari tombol / ketikan di chat pribadi.
const choose = async (env, choice, { gid, round } = {}) => {
  const { ctx } = env;
  const g = gid ? suitStore.get(gid) : suitStore.ofPlayer(ctx);
  if (!g) return ctx.reply("🎮 Tidak ada permainan suit yang sedang berjalan untukmu (mungkin sudah selesai / kedaluwarsa).");
  const side = suitStore.side(g, ctx);
  if (!side) return ctx.reply("🚫 Itu bukan permainan suitmu.");
  if (g.state !== "picking") return ctx.reply("⏳ Belum waktunya memilih, atau permainan sudah selesai.");
  if (round && round !== g.round) return ctx.reply("⌛ Tombol ini dari ronde sebelumnya. Pakai tombol di pesan terbaru.");
  const S = game.SUIT;
  if (g.picks[side]) return ctx.reply(`🔒 Pilihanmu sudah terkunci: ${S[g.picks[side]].icon} *${S[g.picks[side]].name}*.`);

  g.picks[side] = choice;
  const other = sideName(side);
  await ctx.reply(`✅ Pilihanmu: ${S[choice].icon} *${S[choice].name}* — terkunci!\n${g.picks[other] ? "⏳ Memproses hasil di grup..." : "⏳ Menunggu lawan memilih..."}`);
  await say(g, `🔒 *${g[side].name}* sudah memilih.${g.picks[other] ? "" : " Menunggu lawan..."}`);
  if (g.picks.a && g.picks.b) await reveal(env, g);
};

/* ── command ─────────────────────────────────────────────────────────────── */
const suitpvp = definePlugin({
  name: "suitpvp",
  aliases: ["suit", "suitpk"],
  category: "rpg",
  access: { group: true },
  description: "Suit PvP lawan pemain lain (tag lawan, pilih di chat pribadi, hadiah gold + XP)",
  usage: "suitpvp @lawan [taruhan]  ·  suitpvp batal",
  async run(env) {
    const { ctx, user, sock } = env, p = ctx.prefix;

    if (/^(batal|cancel|stop)$/i.test(ctx.args[0] ?? "")) {
      const mine = suitStore.ofPlayer(ctx);
      if (!mine) return ctx.reply("🎮 Kamu tidak sedang dalam permainan suit.");
      suitStore.remove(mine);
      return say(mine, `🚫 Suit antara ${tag(mine.a)} dan ${tag(mine.b)} dibatalkan oleh ${nameFor(ctx.senderId, ctx.pushName)}.`);
    }

    const targetId = ctx.mentionedJid[0] ?? ctx.quotedSender;
    if (!targetId) return ctx.reply(`✊✌️✋ Tag lawanmu. Contoh: *${p}suitpvp @tag* atau *${p}suitpvp @tag 500* (taruhan).`);
    if ([ctx.senderId, ctx.senderPn, ctx.senderLid].filter(Boolean).map(bare).includes(bare(targetId))) return ctx.reply("😅 Masa suit lawan diri sendiri? Tag pemain lain.");
    if (botIdentities(sock).includes(bare(targetId))) return ctx.reply("🤖 Bot tidak ikut suit. Tag pemain lain.");
    const tu = db.users[targetId];
    if (!tu?.rpg) return ctx.reply("🎮 Lawanmu belum pernah main RPG, jadi belum bisa diajak suit.");
    if (suitStore.ofPlayer(ctx)) return ctx.reply(`⏳ Kamu masih dalam permainan suit. Selesaikan atau ketik *${p}suitpvp batal*.`);
    if (suitStore.ofJid(targetId)) return ctx.reply("⏳ Lawanmu sedang bermain suit dengan orang lain. Tunggu sebentar.");

    const r = game.getRpg(user), tr = game.getRpg(tu);
    const bet = game.parseAmount(ctx.args.find((a) => /^(\d|all$|semua$)/i.test(a)), Math.min(r.gold, tr.gold));
    if (bet > r.gold) return ctx.reply(`🪙 Gold-mu kurang untuk taruhan ${fmt(bet)} (punya ${fmt(r.gold)}).`);
    if (bet > tr.gold) return ctx.reply(`🪙 Gold lawanmu kurang untuk taruhan ${fmt(bet)} (punya ${fmt(tr.gold)}).`);

    const g = suitStore.create({
      chat: ctx.chatId, sock, prefix: p, bet,
      a: { id: ctx.senderId, pn: ctx.senderPn, lid: ctx.senderLid, name: nameFor(ctx.senderId, ctx.pushName) },
      b: { id: targetId, name: nameFor(targetId) },
    });
    arm(g, PENDING_MS, expirePending);
    await ctx.reply(
      [
        "✊✌️✋ *SUIT PVP*",
        `${tag(g.a)} menantang ${tag(g.b)}!`,
        betText(g),
        "",
        `${tag(g.b)}, jawab dalam ${PENDING_MS / 1000} detik:`,
        "✅ Terima  →  *y* / *gas* / *yes* / *oke*",
        "❌ Tolak   →  *n* / *gak* / *no* / *gamau*",
      ].join("\n"),
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
  description: "Pilih suit (otomatis dari tombol)",
  usage: "suitpick <batu|gunting|kertas>",
  async run(env) {
    const { ctx } = env, args = ctx.args;
    const choice = game.parseSuit(args.at(-1));
    if (!choice) return ctx.reply("✊✌️✋ Pilih: *batu*, *gunting*, atau *kertas*.");
    const gid = args.length > 1 && /^[0-9a-f]{4}$/i.test(args[0]) ? args[0] : null;
    const round = args.length > 2 ? Number(args[1]) || null : null;
    await choose(env, choice, { gid, round });
  },
});

export default [suitpvp, suitpick];
