import { definePlugin } from "#lib/plugins";
import { fetchAvatar } from "#lib/cards";
import { isRegistered, statusOf } from "#lib/register";
import { sendCard } from "#lib/rpgui";
import { bufferThumbnail, expNeeded, formatNumber, getBuffer, numberOf } from "#lib/utils";

// Bar EXP rapi untuk teks WhatsApp: ▰▰▰▱▱▱▱▱▱▱ 28%
const bar = (value, max, length = 10) => {
  const ratio = Math.min(1, Math.max(0, value / Math.max(max, 1)));
  const filled = Math.round(ratio * length);
  return `${"▰".repeat(filled)}${"▱".repeat(length - filled)} ${Math.round(ratio * 100)}%`;
};

export default definePlugin({
  name: "profil",
  aliases: ["profile", "me"],
  category: "general",
  description: "Lihat profil kamu (atau yang di-tag / di-reply)",
  usage: "profil [@tag]",
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
        "",
        `🎂 ${target.reg.age} tahun  ·  ⚧️ ${target.reg.gender}`,
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
        `🪪 Kartu register: *${ctx.prefix}kartu${self ? "" : " @tag"}*`,
      ].join("\n");
      return sendCard({ sock, ctx }, "profile", {
        name, fallbackName: number, avatar: await fetchAvatar(sock, targetId), age: target.reg.age, gender: target.reg.gender, number,
        status: statusOf(targetId, target, self ? role : null), level: target.level, exp: formatNumber(target.exp), need: formatNumber(need), ratio: target.exp / need,
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
        "",
        `📱 +${number}`,
        self ? `📝 Belum terdaftar — ketik *${ctx.prefix}register*` : "📝 Belum terdaftar",
        "",
        `✨ EXP ${formatNumber(target.exp)} / ${formatNumber(need)}`,
        bar(target.exp, need),
        "",
        `📊 Limit: ${limit}`,
      ].join("\n"),
      { preview: { large: true, title: name, body: `Profil · ${status}`, ...(thumbnail && { thumbnail }) } },
    );
  },
});
