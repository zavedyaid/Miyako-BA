import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { truncate } from "#lib/utils";

// GET /search/yts?query=…&limit=…  → results[{ title, url, duration, views, publishedTime, author: { name } }]
const LIMIT = 10;

export default definePlugin({
  name: "yts",
  aliases: ["ytsearch", "youtubesearch"],
  category: "search",
  description: "Cari video di YouTube",
  usage: "yts <kata kunci>",
  limit: 1,
  async run({ ctx }) {
    const query = ctx.argsStr || ctx.quotedText;
    if (!query) {
      return ctx.reply(`❌ Masukkan kata kunci.\nContoh: *${ctx.prefix}yts lofi hip hop*`, {
        preview: { title: "YouTube Search", body: "Pencarian" },
      });
    }

    ctx.react("⏳");
    try {
      const data = await api.get("/search/yts", { query, limit: LIMIT });
      const results = (data.results ?? []).filter((r) => r?.title && r?.url).slice(0, LIMIT);
      if (!results.length) throw new ApiError(`Tidak ada hasil untuk "${query}".`);

      const rows = results.map((r, i) =>
        [
          `${i + 1}. *${r.title}*`,
          `   ${[r.author?.name, r.duration, r.views && `${r.views} views`, r.publishedTime].filter(Boolean).join(" • ")}`,
          `   ${r.url}`,
        ].join("\n"),
      );

      await ctx.reply(truncate([`▶️ *YouTube Search*`, `🔎 ${query}`, "", ...rows].join("\n"), 3800), {
        preview: { title: "YouTube Search", body: query },
      });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
