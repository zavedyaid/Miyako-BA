import { fetchAvatar, renderCard } from "#lib/cards";
import { config } from "#lib/config";
import { logger } from "#lib/logger";
import { expNeeded, formatNumber, progressBar } from "#lib/utils";

/*
 * Notifikasi naik level otomatis. Dipanggil handler setelah EXP bertambah:
 *   const before = user.level; gainExp(user, n); await announceLevelUp(env, before);
 * Matikan di config.json → features.levelUpNotif = false.
 */
export const announceLevelUp = async ({ sock, ctx, user }, before) => {
  if (config.features?.levelUpNotif === false || ctx.fromMe || !(user.level > before)) return;

  const need = expNeeded(user.level);
  const text = [
    "🎉 *LEVEL UP!*",
    `@${ctx.senderNumber} naik level`,
    `🏆 Level ${before} ➜ *${user.level}*`,
    `✨ EXP ${formatNumber(user.exp)}/${formatNumber(need)}`,
    `     [${progressBar(user.exp, need)}]`,
  ].join("\n");

  // Kartu gambar (link preview besar); gagal merender → pratinjau biasa.
  let card = null;
  try {
    card = await renderCard("levelup", {
      name: ctx.pushName || ctx.senderNumber,
      oldLevel: before,
      newLevel: user.level,
      ratio: need > 0 ? user.exp / need : 0,
      avatar: await fetchAvatar(sock, ctx.senderId),
    });
  } catch (err) {
    logger.warn(`Kartu level-up gagal dirender: ${err.message}`);
  }

  await ctx.reply(text, {
    mentions: [ctx.senderId],
    preview: { title: "🎉 Level Up!", body: `Level ${before} ➜ ${user.level}`, ...(card && { thumbnail: card, large: true }) },
  }).catch(() => {});
};
