import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { truncate } from "#lib/utils";

// GET /search/lyrics?artist=…&title=…  (keduanya wajib)
export default definePlugin({
  name: "lirik",
  aliases: ["lyrics", "lyric"],
  category: "search",
  description: "Cari lirik lagu (artis + judul)",
  usage: "lirik <artis> | <judul>",
  limit: 1,
  async run({ ctx }) {
    const input = ctx.argsStr || ctx.quotedText || "";
    const [artist, ...rest] = (input.includes("|") ? input.split("|") : input.split(/\s[-–—]\s/)).map((v) => v.trim());
    const title = rest.join(" - ").trim();
    if (!artist || !title) {
      return ctx.reply(`❌ Tulis artis dan judul.\nContoh: *${ctx.prefix}lirik Virgoun | Surat Cinta Untuk Starla*`, {
        preview: { title: "Lirik", body: "Cari lirik lagu" },
      });
    }

    ctx.react("⏳");
    try {
      const data = await api.get("/search/lyrics", { artist, title });
      if (!data.lyrics?.trim()) throw new ApiError("Lirik tidak ditemukan.");

      const info = [
        `🎵 *${data.title ?? title}*`,
        `👤 Artis : ${data.artist ?? artist}`,
        data.album && `💿 Album : ${data.album}`,
        data.length && `⏱️ Durasi : ${data.length}`,
        data.language && `🌐 Bahasa : ${data.language}`,
        data.writers && `✍️ Penulis : ${data.writers}`,
        data.producer && `🎧 Produser : ${data.producer}`,
      ].filter(Boolean);

      await ctx.reply([...info, "", "♪", truncate(data.lyrics.trim(), 6000)].join("\n"), {
        preview: { title: data.title ?? title, body: data.artist ?? artist },
      });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
