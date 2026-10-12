import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { collectMedia, listOf } from "#lib/extract";
import { sleep } from "#lib/utils";

// GET /search/konachan?query=…   (gambar anime; ubah nama parameter di sini bila perlu)
const PATH = "/search/konachan";
const DEFAULT_COUNT = 3;
const MAX_COUNT = 8;

export default definePlugin({
  name: "konachan",
  aliases: ["kona"],
  category: "search",
  description: "Cari gambar anime di Konachan",
  usage: "konachan <tag> [| jumlah]",
  limit: 1,
  async run({ ctx }) {
    const [query, rawCount] = (ctx.argsStr || ctx.quotedText || "").split("|").map((v) => v.trim());
    if (!query) {
      return ctx.reply(`❌ Masukkan tag.\nContoh: *${ctx.prefix}konachan hatsune_miku | 5* (maks ${MAX_COUNT})`, {
        preview: { title: "Konachan", body: "Gambar anime" },
      });
    }

    ctx.react("⏳");
    try {
      const pics = listOf(await api.get(PATH, { query }))
        .map((item) => {
          const media = collectMedia(item);
          return { image: media.image[0] ?? media.thumb[0], title: media.title };
        })
        .filter((pic) => pic.image);
      if (!pics.length) throw new ApiError(`Tidak ada gambar untuk "${query}".`);

      const total = Math.min(Math.max(Number.parseInt(rawCount, 10) || DEFAULT_COUNT, 1), MAX_COUNT, pics.length);
      let sent = 0;
      for (const pic of [...pics].sort(() => Math.random() - 0.5)) {
        if (sent >= total) break;
        try {
          await ctx.reply({ image: { url: pic.image }, caption: `🌸 *Konachan* · ${sent + 1}/${total}\n🔎 ${query}` });
          sent++;
          if (sent < total) await sleep(700);
        } catch {
          // lewati gambar yang gagal diunduh
        }
      }
      if (!sent) throw new ApiError("Semua gambar gagal dikirim.");
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err;
    }
  },
});
