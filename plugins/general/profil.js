import { definePlugin } from "#lib/plugins";
import { formatRegDate, isRegistered } from "#lib/register";
import { bufferThumbnail, expNeeded, formatNumber, getBuffer, numberOf, progressBar } from "#lib/utils";

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

    // Foto profil yang sedang dilihat → gambar besar kartu (pratinjau penuh). Tanpa foto (privat) → gambar acak config/reply.
    let thumbnail;
    try {
      const url = await sock.profilePictureUrl(targetId, "image");
      thumbnail = bufferThumbnail(await getBuffer(url), 640);
    } catch {}

    const identity = registered
      ? [
          `🎂 Umur    : ${target.reg.age} tahun`,
          `⚧️ Gender  : ${target.reg.gender}`,
          `🔖 SN      : ${target.reg.sn}`,
          `🎫 No. Kartu : ${target.reg.no}`,
          `📅 Terdaftar : ${formatRegDate(target.reg.at)}`,
        ]
      : [self ? `📝 Belum terdaftar — ketik *${ctx.prefix}register*` : "📝 Belum terdaftar"];

    await ctx.reply(
      [
        `*${name}*`,
        `📱 +${number}`,
        `🏅 ${status}`,
        "",
        ...identity,
        "",
        `📊 Limit : ${isPremium ? "∞" : target.limit}`,
        `🏆 Level : ${target.level}`,
        `✨ EXP   : ${formatNumber(target.exp)}/${formatNumber(need)}`,
        `     [${progressBar(target.exp, need)}]`,
        ...(registered ? ["", `🪪 Lihat kartu: *${ctx.prefix}kartu${self ? "" : " @tag"}*`] : []),
      ].join("\n"),
      { preview: { large: true, title: name, body: `Profil · ${status}`, ...(thumbnail && { thumbnail }) } },
    );
  },
});
