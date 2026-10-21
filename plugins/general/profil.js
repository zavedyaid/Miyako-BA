import { definePlugin } from "#lib/plugins";
import { fetchAvatar } from "#lib/cards";
import { t } from "#lib/i18n";
import { isMaxLevel, rankLabel, rankOf } from "#lib/levels";
import { genderLabel, isRegistered, statusOf } from "#lib/register";
import { sendCard } from "#lib/rpgui";
import { bufferThumbnail, expNeeded, formatNumber, getBuffer, numberOf } from "#lib/utils";

// Bar EXP rapi untuk teks WhatsApp: ▰▰▰▱▱▱▱▱▱▱ 28%
const bar = (value, max, length = 10) => {
  const ratio = Math.min(1, Math.max(0, value / Math.max(max, 1)));
  const filled = Math.round(ratio * length);
  return `${"▰".repeat(filled)}${"▱".repeat(length - filled)} ${Math.round(ratio * 100)}%`;
};

export default definePlugin({
  name: "profile",
  aliases: ["profil", "me"],
  category: "general",
  description: "View your profile (or the tagged / replied person)",
  usage: "profile [@tag]",
  async run({ ctx, sock, db, config, user, role }) {
    const targetId = ctx.mentionedJid[0] ?? ctx.quotedSender ?? ctx.senderId;
    const self = targetId === ctx.senderId;
    const target = self ? user : db.user(targetId);
    const number = numberOf(targetId);
    const registered = isRegistered(target);
    const name = registered ? target.reg.name : self ? ctx.pushName : target.name || number;

    const isOwner = self ? role.owner : config.owners.has(number);
    const isPremium = self ? role.premium : isOwner || Boolean(target.premium?.on);
    const status = isOwner ? "👑 Owner" : isPremium ? "💎 Premium" : "📊 Free";
    const need = expNeeded(target.level);
    const limit = isPremium ? "Unlimited" : formatNumber(target.limit);
    const gold = formatNumber(target.rpg?.gold ?? 0);

    // Sudah terdaftar → profil tampil sebagai KARTU gambar (kartu register versi profil).
    if (registered) {
      const caption = [
        `*${name}*`,
        `${status}  ·  Lv ${target.level}`,
        t("pf.rank", { rank: rankLabel(target.level) }),
        "",
        t("pf.demo", { age: target.reg.age, gender: genderLabel(target.reg.gender) }),
        `📱 +${number}`,
        `🔖 SN: ${target.reg.sn}`,
        `🎫 No. ${target.reg.no}`,
        "",
        `✨ EXP ${formatNumber(target.exp)} / ${formatNumber(need)}`,
        bar(target.exp, need),
        "",
        `📊 Limit: ${limit}`,
        `🪙 Gold: ${gold} G`,
        "",
        t("pf.cardHint", { p: ctx.pfx, tag: self ? "" : " @tag" }),
      ].join("\n");
      return sendCard({ sock, ctx }, "profile", {
        name, fallbackName: number, avatar: await fetchAvatar(sock, targetId), age: target.reg.age, gender: genderLabel(target.reg.gender), number, rank: rankOf(target.level).name,
        status: statusOf(targetId, target, self ? role : null), level: target.level, exp: formatNumber(target.exp), need: formatNumber(need), ratio: isMaxLevel(target.level) ? 1 : target.exp / need,
        limit: isPremium ? "Unlimited" : target.limit, gold, sn: target.reg.sn, no: target.reg.no,
      }, caption);
    }

    // Belum terdaftar: teks + pratinjau besar berisi foto profil. Tanpa foto (privat) → gambar acak config/reply.
    let thumbnail;
    try {
      const url = await sock.profilePictureUrl(targetId, "image");
      thumbnail = bufferThumbnail(await getBuffer(url), 640);
    } catch {}

    await ctx.reply(
      [
        `*${name}*`,
        `${status}  ·  Lv ${target.level}`,
        t("pf.rank", { rank: rankLabel(target.level) }),
        "",
        `📱 +${number}`,
        self ? t("pf.notRegSelf", { p: ctx.pfx }) : t("pf.notReg"),
        "",
        `✨ EXP ${formatNumber(target.exp)} / ${formatNumber(need)}`,
        bar(target.exp, need),
        "",
        `📊 Limit: ${limit}`,
      ].join("\n"),
      { preview: { large: true, title: name, body: t("pf.previewBody", { status }), ...(thumbnail && { thumbnail }) } },
    );
  },
});
