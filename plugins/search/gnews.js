import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { numbered } from "#lib/extract";
import { truncate } from "#lib/utils";

// GET /search/google-news?query=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/search/google-news";

export default definePlugin({
  name: "gnews",
  aliases: ["googlenews", "news"],
  category: "search",
  description: "Cari berita di Google News",
  usage: "gnews <kata kunci>",
  limit: 1,
  async run({ ctx }) {
    const query = ctx.argsStr || ctx.quotedText;
    if (!query) {
      return ctx.reply(`❌ Masukkan kata kunci.\nContoh: *${ctx.prefix}gnews teknologi*`, {
        preview: { title: "Google News", body: "Pencarian" },
      });
    }

    ctx.react("⏳");
    try {
      const rows = numbered(await api.get(PATH, { query }), 10);
      if (!rows.length) throw new ApiError(`Tidak ada hasil untuk "${query}".`);

      await ctx.reply(truncate([`📰 *Google News*`, `🔎 ${query}`, "", ...rows].join("\n"), 3800), {
        preview: { title: "Google News", body: query },
      });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
