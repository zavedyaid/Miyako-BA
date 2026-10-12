import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { audioMime, collectMedia, mediaSource } from "#lib/extract";

// GET /downloader/soundcloud?url=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/downloader/soundcloud";
const LINK = /https?:\/\/\S+/i;

export default definePlugin({
  name: "soundcloud",
  aliases: ["scdl"],
  category: "downloader",
  description: "Unduh lagu SoundCloud",
  usage: "soundcloud <link>",
  limit: 1,
  async run({ ctx }) {
    const url = ctx.argsStr.match(LINK)?.[0] ?? ctx.quotedText?.match(LINK)?.[0];
    if (!url) {
      return ctx.reply(`❌ Kirim link SoundCloud.\nContoh: *${ctx.prefix}soundcloud https://soundcloud.com/xxxx*`, {
        preview: { title: "SoundCloud", body: "Downloader" },
      });
    }

    ctx.react("⏳");
    try {
      const media = collectMedia(await api.get(PATH, { url }), { ignore: [url] });
      const caption = `🎵 *SoundCloud*${media.title ? `\n${media.title}` : ""}`;

      const audio = media.audio[0] ?? media.video[0];
      if (!audio) throw new ApiError("Audio tidak ditemukan di respons API.");

      await ctx.reply(caption);
      await ctx.reply({ audio: mediaSource(audio), mimetype: audioMime(audio) });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
