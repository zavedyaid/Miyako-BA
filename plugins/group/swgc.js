import { definePlugin } from "#lib/plugins";
import { STATUS_MAX_SECONDS, audioToOpus, audioToVideo } from "#lib/media";

/*
 * Posting status grup (Group Status) lewat opsi `groupStatus` @zavedyaid/baileys.
 * Hanya admin grup & owner. Mendukung teks, gambar, video, dan audio (audio utuh sebagai voice note — lihat lib/media.js).
 *   .swgc <teks>                       → status teks
 *   kirim / reply gambar|video + .swgc [caption]
 *   kirim / reply audio + .swgc        → audio utuh sebagai voice note (tanpa batas 60 detik)
 *   kirim / reply audio + .swgc -v     → cadangan: audio dibungkus video (maks 60 detik)
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
    // "-v": audio dibungkus video (cadangan). Tanpa -v: audio utuh sebagai voice note.
    const asVideo = /(^|\s)-v(\s|$)/i.test(ctx.argsStr);
    const text = (ctx.argsStr.replace(/(^|\s)-v(?=\s|$)/gi, " ").trim() || ctx.quotedText || "");
    let payload;
    let note = "";

    if (media) {
      if (["image", "video"].includes(media.kind)) {
        payload = { [media.kind]: media.buffer, ...(text && { caption: text }) };
      } else if (media.kind === "audio") {
        ctx.react("⏳");
        if (asVideo) {
          // Cadangan bila WhatsApp-mu menolak voice note sebagai status: audio dibungkus video (maks 60 detik).
          const video = await audioToVideo(media.buffer).catch(() => {
            throw new Error("Audio tidak bisa diubah jadi video status (file rusak atau format tidak didukung).");
          });
          payload = { video, mimetype: "video/mp4", ...(text && { caption: text }) };
          note = `\n🎵 Audio dikirim sebagai video status (maks ${STATUS_MAX_SECONDS} detik).`;
        } else {
          // Audio utuh (tanpa batas 60 detik) sebagai voice note.
          const opus = await audioToOpus(media.buffer).catch(() => {
            throw new Error("Audio tidak bisa diproses (file rusak atau format tidak didukung).");
          });
          payload = { audio: opus.buffer, mimetype: "audio/ogg; codecs=opus", ptt: true, ...(opus.seconds && { seconds: opus.seconds }) };
          note = `\n🎵 Audio dikirim utuh sebagai voice note${opus.seconds ? ` (${Math.floor(opus.seconds / 60)}:${String(opus.seconds % 60).padStart(2, "0")})` : ""}.`;
        }
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
