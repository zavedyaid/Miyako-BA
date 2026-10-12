import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { numbered } from "#lib/extract";
import { truncate } from "#lib/utils";

// GET /search/dafont?query=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/search/dafont";

export default definePlugin({
  name: "dafont",
  aliases: [],
  category: "search",
  description: "Cari font di DaFont",
  usage: "dafont <kata kunci>",
  limit: 1,
  async run({ ctx }) {
    const query = ctx.argsStr || ctx.quotedText;
    if (!query) {
      return ctx.reply(`❌ Masukkan kata kunci.\nContoh: *${ctx.prefix}dafont script*`, {
        preview: { title: "DaFont", body: "Pencarian" },
      });
    }

    ctx.react("⏳");
    try {
      const rows = numbered(await api.get(PATH, { query }), 10);
      if (!rows.length) throw new ApiError(`Tidak ada hasil untuk "${query}".`);

      await ctx.reply(truncate([`🔤 *DaFont*`, `🔎 ${query}`, "", ...rows].join("\n"), 3800), {
        preview: { title: "DaFont", body: query },
      });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
