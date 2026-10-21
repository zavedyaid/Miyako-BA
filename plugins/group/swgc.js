import { definePlugin } from "#lib/plugins";
import { STATUS_MAX_SECONDS, audioToOpus, audioToVideo } from "#lib/media";
import { sendGroupStatusMedia } from "#lib/groupstatus";
import { t as tl } from "#lib/i18n";

/*
 * Posting status grup (Group Status). Hanya admin grup & owner.
 *   .swgc <teks>                       → status teks
 *   kirim / reply gambar|video + .swgc [caption]
 *   kirim / reply audio + .swgc        → voice note UTUH (tanpa batas 60 detik)
 *   kirim / reply audio + .swgc -v     → cadangan: audio dibungkus video (maks 60 detik)
 *   tambah -s                          → jalur lama (sendMessage + groupStatus) bila jalur baru bermasalah
 * Media dikirim lewat lib/groupstatus.js (relay manual) — lihat penjelasan di sana.
 */
export default definePlugin({
  name: "swgc",
  aliases: ["sgc", "statusgrup", "groupstatus"],
  category: "group",
  description: "Posting status grup (teks / gambar / video / audio)",
  usage: "swgc <teks> (atau reply / kirim media)",
  access: { group: true, admin: true },
  async run({ sock, ctx }) {
    const media = ctx.hasMedia ? await ctx.fetchMedia().catch(() => null) : null;
    const flag = (name) => new RegExp(`(^|\\s)-${name}(\\s|$)`, "i").test(ctx.argsStr);
    const asVideo = flag("v");
    const legacy = flag("s");
    const text = ctx.argsStr.replace(/(^|\s)-[vs](?=\s|$)/gi, " ").trim() || ctx.quotedText || "";
    let spec = null; // media untuk relay manual
    let payload = null; // jalur teks / lama
    let note = "";

    if (media) {
      if (["image", "video"].includes(media.kind)) {
        spec = { kind: media.kind, buffer: media.buffer, mimetype: media.mimetype || (media.kind === "image" ? "image/jpeg" : "video/mp4"), caption: text };
      } else if (media.kind === "audio") {
        ctx.react("⏳");
        if (asVideo) {
          const video = await audioToVideo(media.buffer).catch(() => {
            throw new Error("Audio tidak bisa diubah jadi video status (file rusak atau format tidak didukung).");
          });
          spec = { kind: "video", buffer: video, mimetype: "video/mp4", caption: text };
          note = `\n🎵 Audio dikirim sebagai video status (maks ${STATUS_MAX_SECONDS} detik).`;
        } else {
          const opus = await audioToOpus(media.buffer).catch(() => {
            throw new Error("Audio tidak bisa diproses (file rusak atau format tidak didukung).");
          });
          spec = { kind: "audio", buffer: opus.buffer, mimetype: "audio/ogg; codecs=opus", ptt: true, seconds: opus.seconds || undefined };
          note = `\n🎵 Audio dikirim utuh sebagai voice note${opus.seconds ? ` (${Math.floor(opus.seconds / 60)}:${String(opus.seconds % 60).padStart(2, "0")})` : ""}.`;
        }
      } else {
        return ctx.reply(tl("grp.swgc.1"));
      }
    } else if (text) {
      payload = { text };
    } else {
      return ctx.reply(tl("grp.swgc.2", { prefix: ctx.pfx }));
    }

    ctx.react("⏳");
    try {
      if (spec && !legacy) {
        await sendGroupStatusMedia(sock, ctx.chatId, spec);
      } else {
        const legacyPayload = payload ?? { [spec.kind]: spec.buffer, ...(spec.mimetype && { mimetype: spec.mimetype }), ...(spec.ptt && { ptt: true }), ...(spec.seconds && { seconds: spec.seconds }), ...(spec.caption && spec.kind !== "audio" && { caption: spec.caption }) };
        await ctx.reply({ ...legacyPayload, groupStatus: true }, { quoted: false });
      }
      ctx.react("✅");
      await ctx.reply(tl("grp.swgc.3", { note, v: spec && legacy ? tl("grp2.swgc.1") : "" }));
    } catch (err) {
      ctx.react("❌");
      throw err;
    }
  },
});
