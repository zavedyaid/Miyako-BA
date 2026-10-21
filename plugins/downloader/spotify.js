import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { audioMime, collectMedia, mediaSource } from "#lib/extract";
import { t as tl } from "#lib/i18n";

// GET /downloader/spotify?url=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/downloader/spotify";
const LINK = /https?:\/\/\S+/i;

export default definePlugin({
  name: "spotify",
  aliases: ["spotifydl", "spdl"],
  category: "downloader",
  description: "Unduh lagu Spotify",
  usage: "spotify <link lagu>",
  limit: 1,
  async run({ ctx }) {
    const url = ctx.argsStr.match(LINK)?.[0] ?? ctx.quotedText?.match(LINK)?.[0];
    if (!url) {
      return ctx.reply(tl("dl.spotify.1", { prefix: ctx.pfx }), {
        preview: { title: "Spotify", body: "Downloader" },
      });
    }

    ctx.react("⏳");
    try {
      const media = collectMedia(await api.get(PATH, { url }), { ignore: [url] });
      const audio = media.audio[0] ?? media.file[0] ?? media.video[0];
      if (!audio) throw new ApiError("Audio tidak ditemukan di respons API.");

      const cover = media.thumb[0] ?? media.image[0];
      const caption = `🎧 *Spotify*${media.title ? `\n${media.title}` : ""}`;
      if (cover) {
        try {
          await ctx.reply({ image: { url: cover }, caption });
        } catch {
          await ctx.reply(caption);
        }
      } else {
        await ctx.reply(caption);
      }
      await ctx.reply({ audio: mediaSource(audio), mimetype: audioMime(audio) });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
