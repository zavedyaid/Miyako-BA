import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { audioMime, collectMedia, mediaSource } from "#lib/extract";

// GET /downloader/ytplay?query=…  (atau ?url=… bila input berupa link)
const LINK = /https?:\/\/\S+/i;

export default definePlugin({
  name: "ytplay",
  aliases: ["play"],
  category: "downloader",
  description: "Putar lagu dari YouTube (cari judul / link)",
  usage: "ytplay <judul lagu atau link>",
  limit: 1,
  async run({ ctx }) {
    const input = ctx.argsStr || ctx.quotedText;
    if (!input) {
      return ctx.reply(`❌ Tulis judul lagu atau link.\nContoh: *${ctx.prefix}ytplay Sheila on 7 Dan*`, {
        preview: { title: "YouTube Play", body: "Putar lagu dari YouTube" },
      });
    }

    ctx.react("⏳");
    try {
      const link = input.match(LINK)?.[0];
      const media = collectMedia(await api.get("/downloader/ytplay", link ? { url: link } : { query: input }), { ignore: link ? [link] : [] });
      const audio = media.audio[0] ?? media.video[0];
      if (!audio) throw new ApiError("Audio tidak ditemukan di respons API.");

      await ctx.reply(`🎧 *YouTube Play*\n${media.title ?? input}`);
      if (media.audio[0]) await ctx.reply({ audio: mediaSource(audio), mimetype: audioMime(audio) });
      else await ctx.reply({ video: mediaSource(audio), caption: media.title });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err;
    }
  },
});
