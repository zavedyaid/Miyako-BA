import { definePlugin } from "#lib/plugins";
import { cardPayload, fetchAvatar, renderCard } from "#lib/cards";
import { db } from "#lib/database";
import { targetsOf } from "#lib/targets";
import { t } from "#lib/i18n";
import { isMaxLevel, nextRank, rankLabel, rankOf } from "#lib/levels";
import { expNeeded, formatNumber, numberOf, progressBar } from "#lib/utils";

/*
 * Kartu level, rank (config/levels.json) & progres EXP — makin banyak chat, bar makin penuh.
 *   .level            → levelmu       .level @user / reply → level orang lain
 * Kiri = level sekarang, kanan = level berikutnya, bar = EXP menuju level berikutnya.
 */
export default definePlugin({
  name: "level",
  aliases: ["rank", "exp", "lvl"],
  category: "general",
  description: "Level card, rank & EXP progress",
  usage: "level [@user]",
  async run({ sock, ctx, user: self }) {
    const [target] = targetsOf(ctx, { fromArgs: false });
    const isSelf = !target;
    const jid = target ?? ctx.senderId;
    const user = isSelf ? self : (db.users[jid] ?? db.user(jid));

    const need = expNeeded(user.level);
    const maxed = isMaxLevel(user.level);
    const ratio = maxed ? 1 : need > 0 ? Math.min(1, user.exp / need) : 0;
    const percent = Math.round(ratio * 100);
    const name = isSelf ? ctx.pushName : (user.name ?? numberOf(jid));
    const upcoming = nextRank(user.level);

    const text = [
      t("lv.title", { level: user.level, rank: rankLabel(user.level), num: numberOf(jid) }),
      ...(maxed
        ? [t("lv.max")]
        : [
            t("lv.exp", { exp: formatNumber(user.exp), need: formatNumber(need), pct: percent }),
            `     [${progressBar(user.exp, need)}]`,
            t("lv.left", { left: formatNumber(Math.max(0, need - user.exp)), next: user.level + 1 }),
          ]),
      ...(upcoming ? [t("lv.nextRank", { rank: `${upcoming.emoji} ${upcoming.name}`, at: upcoming.from })] : []),
    ].join("\n");

    let card = null;
    try {
      card = await renderCard("levelup", {
        name, fallbackName: numberOf(jid), oldLevel: user.level, newLevel: maxed ? user.level : user.level + 1, rank: rankOf(user.level).name, ratio,
        avatar: await fetchAvatar(sock, jid),
      });
    } catch {
      /* tanpa kartu: teks saja */
    }
    if (!card) return ctx.reply(text, { mentions: [jid] });

    const style = db.settings.cardStyle ?? "preview";
    if (style === "image") return ctx.reply({ image: card, caption: text, mentions: [jid] });
    const payload = cardPayload(card, { text, mentions: [jid], title: t("lv.cardTitle"), body: t("lv.cardBody", { level: user.level, pct: percent }), style });
    await ctx.reply(text, { mentions: [jid], preview: { title: payload.externalAdReply.title, body: payload.externalAdReply.body, thumbnail: card, large: true, url: payload.externalAdReply.url } });
  },
});
