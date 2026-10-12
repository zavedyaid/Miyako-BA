import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { audioMime, collectMedia, mediaSource } from "#lib/extract";

// GET /downloader/likee?url=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/downloader/likee";
const LINK = /https?:\/\/\S+/i;

export default definePlugin({
  name: "likee",
  aliases: [],
  category: "downloader",
  description: "Unduh video Likee",
  usage: "likee <link>",
  limit: 1,
  async run({ ctx }) {
    const url = ctx.argsStr.match(LINK)?.[0] ?? ctx.quotedText?.match(LINK)?.[0];
    if (!url) {
      return ctx.reply(`❌ Kirim link Likee.\nContoh: *${ctx.prefix}likee https://likee.video/xxxx*`, {
        preview: { title: "Likee", body: "Downloader" },
      });
    }

    ctx.react("⏳");
    try {
      const media = collectMedia(await api.get(PATH, { url }), { ignore: [url] });
      const caption = `🎬 *Likee*${media.title ? `\n${media.title}` : ""}`;

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
