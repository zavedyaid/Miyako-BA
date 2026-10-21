import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { audioMime, collectMedia, mediaSource } from "#lib/extract";
import { t as tl } from "#lib/i18n";

// GET /downloader/rednote?url=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/downloader/rednote";
const LINK = /https?:\/\/\S+/i;

export default definePlugin({
  name: "rednote",
  aliases: ["xhs", "xiaohongshu"],
  category: "downloader",
  description: "Unduh video / foto RedNote (Xiaohongshu)",
  usage: "rednote <link>",
  limit: 1,
  async run({ ctx }) {
    const url = ctx.argsStr.match(LINK)?.[0] ?? ctx.quotedText?.match(LINK)?.[0];
    if (!url) {
      return ctx.reply(tl("dl.rednote.1", { prefix: ctx.pfx }), {
        preview: { title: "RedNote", body: "Downloader" },
      });
    }

    ctx.react("⏳");
    try {
      const media = collectMedia(await api.get(PATH, { url }), { ignore: [url] });
      const caption = `📕 *RedNote*${media.title ? `\n${media.title}` : ""}`;

      if (media.video[0]) {
        await ctx.reply({ video: mediaSource(media.video[0]), caption });
      } else if (media.image.length) {
        // Postingan foto / slideshow: kirim gambarnya (maks 5)
        for (const [i, image] of media.image.slice(0, 5).entries()) {
          await ctx.reply({ image: mediaSource(image), ...(i === 0 && { caption }) });
        }
      } else if (media.audio[0]) {
        await ctx.reply({ audio: mediaSource(media.audio[0]), mimetype: audioMime(media.audio[0]) });
      } else {
        throw new ApiError("Media tidak ditemukan di respons API.");
      }
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
