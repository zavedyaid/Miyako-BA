import { db } from "#lib/database";
import { logger } from "#lib/logger";
import { tr } from "#lib/tr";
import { numberOf } from "#lib/utils";

/*
 * Anti-spam grup (.on antispam): pesan banjir DIHAPUS otomatis.
 *   • ≥ MAX_MSG pesan dalam WINDOW detik, atau teks yang sama ≥ MAX_SAME kali dalam SAME_WINDOW detik → dianggap spam
 *   • semua pesan spam yang masih tercatat + pesan yang memicu dihapus; peringatan dikirim paling sering sekali per 20 dtk
 *   • 3 kali kena dalam 10 menit → dikeluarkan dari grup
 * Syarat: bot admin grup. Admin grup, owner, dan pesan bot sendiri tidak pernah ditindak.
 */
const WINDOW = 8_000, MAX_MSG = 6, SAME_WINDOW = 25_000, MAX_SAME = 4, STRIKE_TTL = 10 * 60_000, MAX_STRIKE = 3;
const seen = new Map(); // "chat|sender" → { log: [{ at, key, text }], strikes: [ms], warnedAt }

export const antiSpam = async (env, next) => {
  const { sock, ctx, chat, role } = env;
  if (!ctx.isGroup || !chat?.antiSpam || ctx.fromMe || role.owner) return next();

  const id = `${ctx.chatId}|${ctx.senderId}`, now = Date.now();
  const rec = seen.get(id) ?? { log: [], strikes: [], warnedAt: 0 };
  seen.set(id, rec);
  rec.log = rec.log.filter((m) => now - m.at < SAME_WINDOW);
  const text = (ctx.text ?? "").trim().toLowerCase();
  rec.log.push({ at: now, key: ctx.raw.key, text });

  const burst = rec.log.filter((m) => now - m.at < WINDOW).length;
  const same = text ? rec.log.filter((m) => m.text === text).length : 0;
  if (burst < MAX_MSG && same < MAX_SAME) return next();

  const { isAdmin, isBotAdmin } = await env.group();
  if (isAdmin || !isBotAdmin) return next();

  const doomed = rec.log.splice(0).map((m) => m.key);
  for (const key of doomed) sock.sendMessage(ctx.chatId, { delete: key }).catch(() => {});
  rec.log = [];

  if (now - rec.warnedAt > 20_000) {
    rec.warnedAt = now;
    rec.strikes = rec.strikes.filter((t) => now - t < STRIKE_TTL);
    rec.strikes.push(now);
    const tag = `@${numberOf(ctx.senderId)}`, mentions = [ctx.senderId];
    if (rec.strikes.length >= MAX_STRIKE) {
      seen.delete(id);
      await ctx.reply(tr(`🚫 ${tag} terus spam — dikeluarkan dari grup.`, `🚫 ${tag} kept spamming — removed from the group.`), { quoted: false, mentions, preview: false }).catch(() => {});
      sock.groupParticipantsUpdate(ctx.chatId, [ctx.senderId], "remove").catch((err) => logger.warn(`antispam: kick failed (${err.message})`));
    } else {
      ctx.reply(tr(`⚠️ ${tag} jangan spam! Pesan banjirmu dihapus (peringatan ${rec.strikes.length}/${MAX_STRIKE}).`, `⚠️ ${tag} don't spam! Your flood was deleted (warning ${rec.strikes.length}/${MAX_STRIKE}).`), { quoted: false, mentions, preview: false }).catch(() => {});
    }
  }
  db.save("groups");
  // pesan spam tidak diteruskan ke command lain
};
