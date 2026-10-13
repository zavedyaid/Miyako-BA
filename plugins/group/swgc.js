import { definePlugin } from "#lib/plugins";

/*
 * Posting status grup (Group Status) lewat opsi `groupStatus` @zavedyaid/baileys.
 * Hanya admin grup & owner. Mendukung teks, gambar, video, dan audio.
 *   .swgc <teks>                       → status teks
 *   kirim / reply gambar|video + .swgc [caption]
 *   kirim / reply audio + .swgc
 */
export default definePlugin({
  name: "swgc",
  aliases: ["sgc", "statusgrup", "groupstatus"],
  category: "group",
  description: "Posting status grup (teks / gambar / video / audio)",
  usage: "swgc <teks> (atau reply / kirim media)",
  access: { group: true, admin: true },
  async run({ ctx }) {
    const media = ctx.hasMedia ? await ctx.fetchMedia().catch(() => null) : null;
    const text = ctx.argsStr || ctx.quotedText || "";
    let payload;

    if (media) {
      if (["image", "video"].includes(media.kind)) {
        payload = { [media.kind]: media.buffer, ...(text && { caption: text }) };
      } else if (media.kind === "audio") {
        payload = { audio: media.buffer, mimetype: media.mimetype || "audio/mpeg" };
      } else {
        return ctx.reply("❌ Status grup hanya mendukung teks, gambar, video, dan audio.");
      }
    } else if (text) {
      payload = { text };
    } else {
      return ctx.reply(`❌ Tulis teks atau kirim / reply media.\nContoh: *${ctx.prefix}swgc halo semua*`);
    }

    ctx.react("⏳");
    try {
      await ctx.reply({ ...payload, groupStatus: true }, { quoted: false });
      ctx.react("✅");
      await ctx.reply("✅ Status grup terkirim.");
    } catch (err) {
      ctx.react("❌");
      throw err;
    }
  },
});
