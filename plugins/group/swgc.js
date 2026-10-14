import { definePlugin } from "#lib/plugins";
import { STATUS_MAX_SECONDS, audioToVideo } from "#lib/media";

/*
 * Posting status grup (Group Status) lewat opsi `groupStatus` @zavedyaid/baileys.
 * Hanya admin grup & owner. Mendukung teks, gambar, video, dan audio (audio diubah jadi video — lihat lib/media.js).
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
    let note = "";

    if (media) {
      if (["image", "video"].includes(media.kind)) {
        payload = { [media.kind]: media.buffer, ...(text && { caption: text }) };
      } else if (media.kind === "audio") {
        // Audio mentah tidak didukung sebagai status (muncul "update WhatsApp"): bungkus jadi video, maks 60 detik.
        ctx.react("⏳");
        const video = await audioToVideo(media.buffer).catch(() => {
          throw new Error("Audio tidak bisa diubah jadi video status (file rusak atau format tidak didukung).");
        });
        payload = { video, mimetype: "video/mp4", ...(text && { caption: text }) };
        note = `\n🎵 Audio dikirim sebagai video status (maks ${STATUS_MAX_SECONDS} detik).`;
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
      await ctx.reply(`✅ Status grup terkirim.${note}`);
    } catch (err) {
      ctx.react("❌");
      throw err;
    }
  },
});
