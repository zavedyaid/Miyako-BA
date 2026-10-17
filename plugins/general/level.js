import { definePlugin } from "#lib/plugins";
import { cardPayload, fetchAvatar, renderCard } from "#lib/cards";
import { db } from "#lib/database";
import { targetsOf } from "#lib/targets";
import { expNeeded, formatNumber, numberOf, progressBar } from "#lib/utils";

/*
 * Kartu level & progres EXP — makin banyak chat, bar makin penuh.
 *   .level            → levelmu       .level @user / reply → level orang lain
 * Kiri = level sekarang, kanan = level berikutnya, bar = EXP menuju level berikutnya.
 */
export default definePlugin({
  name: "level",
  aliases: ["rank", "exp", "lvl"],
  category: "general",
  description: "Kartu level & progres EXP",
  usage: "level [@user]",
  async run({ sock, ctx, user: self }) {
    const [target] = targetsOf(ctx, { fromArgs: false });
    const isSelf = !target;
    const jid = target ?? ctx.senderId;
    const user = isSelf ? self : (db.users[jid] ?? db.user(jid));

    const need = expNeeded(user.level);
    const ratio = need > 0 ? Math.min(1, user.exp / need) : 0;
    const percent = Math.round(ratio * 100);
    const name = isSelf ? ctx.pushName : (user.name ?? numberOf(jid));

    const text = [
      `🏆 *Level ${user.level}* — @${numberOf(jid)}`,
      `✨ EXP ${formatNumber(user.exp)}/${formatNumber(need)} (${percent}%)`,
      `     [${progressBar(user.exp, need)}]`,
      `➡️ ${formatNumber(Math.max(0, need - user.exp))} EXP lagi ke level ${user.level + 1}`,
    ].join("\n");

    let card = null;
    try {
      card = await renderCard("levelup", {
        name, fallbackName: numberOf(jid), oldLevel: user.level, newLevel: user.level + 1, label: `Sekarang level ${user.level}`, ratio,
        avatar: await fetchAvatar(sock, jid),
      });
    } catch {
      /* tanpa kartu: teks saja */
    }
    if (!card) return ctx.reply(text, { mentions: [jid] });

    const style = db.settings.cardStyle ?? "preview";
    if (style === "image") return ctx.reply({ image: card, caption: text, mentions: [jid] });
    const payload = cardPayload(card, { text, mentions: [jid], title: "🏆 Level & EXP", body: `Level ${user.level} • ${percent}%`, style });
    await ctx.reply(text, { mentions: [jid], preview: { title: payload.externalAdReply.title, body: payload.externalAdReply.body, thumbnail: card, large: true, url: payload.externalAdReply.url } });
  },
});
