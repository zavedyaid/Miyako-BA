import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { numbered } from "#lib/extract";
import { truncate } from "#lib/utils";

// GET /search/dramabox?query=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/search/dramabox";

export default definePlugin({
  name: "dramabox",
  aliases: ["drakor"],
  category: "search",
  description: "Cari drama di DramaBox",
  usage: "dramabox <kata kunci>",
  limit: 1,
  async run({ ctx }) {
    const query = ctx.argsStr || ctx.quotedText;
    if (!query) {
      return ctx.reply(`❌ Masukkan kata kunci.\nContoh: *${ctx.prefix}dramabox cinta*`, {
        preview: { title: "DramaBox", body: "Pencarian" },
      });
    }

    ctx.react("⏳");
    try {
      const rows = numbered(await api.get(PATH, { query }), 10);
      if (!rows.length) throw new ApiError(`Tidak ada hasil untuk "${query}".`);

      await ctx.reply(truncate([`🎭 *DramaBox*`, `🔎 ${query}`, "", ...rows].join("\n"), 3800), {
        preview: { title: "DramaBox", body: query },
      });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
