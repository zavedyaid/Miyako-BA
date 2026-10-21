import { cardUrl, fetchAvatar, renderCard } from "#lib/cards";
import { db } from "#lib/database";
import { config } from "#lib/config";
import { t } from "#lib/i18n";
import { isMaxLevel, rankLabel, rankOf, rankedUp } from "#lib/levels";
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
  const maxed = isMaxLevel(user.level);
  const text = [
    t("lu.title"),
    t("lu.body", { num: ctx.senderNumber }),
    t("lu.levels", { before, after: user.level }),
    ...(rankedUp(before, user.level) ? [t("lu.rankUp", { rank: rankLabel(user.level) })] : []),
    ...(maxed ? [t("lu.max")] : [t("lu.exp", { exp: formatNumber(user.exp), need: formatNumber(need), pct: Math.round((user.exp / need) * 100) }), `     [${progressBar(user.exp, need)}]`]),
  ].join("\n");

  // Kartu gambar (link preview besar); gagal merender → pratinjau biasa.
  let card = null;
  try {
    card = await renderCard("levelup", {
      name: ctx.pushName || ctx.senderNumber,
      fallbackName: ctx.senderNumber,
      oldLevel: before,
      newLevel: user.level,
      rank: rankOf(user.level).name,
      ratio: 1, // naik level = bar penuh (EXP baru sudah mulai dari awal level berikutnya; lihat progres sekarang lewat .level)
      avatar: await fetchAvatar(sock, ctx.senderId),
    });
  } catch (err) {
    logger.warn(`Level-up card failed to render: ${err.message}`);
  }

  if (card && db.settings.cardStyle === "image") {
    await ctx.reply({ image: card, caption: text, mentions: [ctx.senderId] }).catch(() => {});
    return;
  }
  const delivered = await ctx
    .reply(text, {
      mentions: [ctx.senderId],
      preview: { title: t("lu.previewTitle"), body: t("lu.previewBody", { before, after: user.level }), ...(card && { thumbnail: card, large: true, url: cardUrl() }) },
    })
    .then(() => true, (err) => {
      logger.warn(`Level-up card (preview) failed to send: ${err.message}`);
      return false;
    });
  // WhatsApp menolak link preview besar → kirim kartunya sebagai gambar biasa.
  if (!delivered && card) await ctx.reply({ image: card, caption: text, mentions: [ctx.senderId] }).catch(() => {});
};
