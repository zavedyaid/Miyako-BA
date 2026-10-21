import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { numbered } from "#lib/extract";
import { truncate } from "#lib/utils";
import { t as tl } from "#lib/i18n";

// GET /search/soundcloud?query=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/search/soundcloud";

export default definePlugin({
  name: "scsearch",
  aliases: ["soundcloudsearch"],
  category: "search",
  description: "Cari lagu di SoundCloud",
  usage: "scsearch <kata kunci>",
  limit: 1,
  async run({ ctx }) {
    const query = ctx.argsStr || ctx.quotedText;
    if (!query) {
      return ctx.reply(tl("src.scsearch.1", { prefix: ctx.pfx }), {
        preview: { title: "SoundCloud", body: "Pencarian" },
      });
    }

    ctx.react("⏳");
    try {
      const rows = numbered(await api.get(PATH, { query }), 10);
      if (!rows.length) throw new ApiError(`Tidak ada hasil untuk "${query}".`);

      await ctx.reply(truncate([`🎵 *SoundCloud*`, `🔎 ${query}`, "", ...rows].join("\n"), 3800), {
        preview: { title: "SoundCloud", body: query },
      });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
