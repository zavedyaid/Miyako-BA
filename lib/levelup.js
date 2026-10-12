import { config } from "#lib/config";
import { expNeeded, formatNumber, progressBar } from "#lib/utils";

/*
 * Notifikasi naik level otomatis. Dipanggil handler setelah EXP bertambah:
 *   const before = user.level; gainExp(user, n); await announceLevelUp(env, before);
 * Matikan di config.json → features.levelUpNotif = false.
 */
export const announceLevelUp = async ({ ctx, user }, before) => {
  if (config.features?.levelUpNotif === false || ctx.fromMe || !(user.level > before)) return;

  const need = expNeeded(user.level);
  const text = [
    "🎉 *LEVEL UP!*",
    `@${ctx.senderNumber} naik level`,
    `🏆 Level ${before} ➜ *${user.level}*`,
    `✨ EXP ${formatNumber(user.exp)}/${formatNumber(need)}`,
    `     [${progressBar(user.exp, need)}]`,
  ].join("\n");

  await ctx.reply(text, {
    mentions: [ctx.senderId],
    preview: { title: "🎉 Level Up!", body: `Level ${before} ➜ ${user.level}` },
  }).catch(() => {});
};
