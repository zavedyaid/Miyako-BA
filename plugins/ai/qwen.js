import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { markdownToWhatsApp, pickText } from "#lib/extract";
import { truncate } from "#lib/utils";

// GET /ai/qwen?prompt=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/ai/qwen";

export default definePlugin({
  name: "qwen",
  aliases: [],
  category: "ai",
  description: "Tanya Qwen AI",
  usage: "qwen <pertanyaan> (atau reply teks)",
  limit: 1,
  async run({ ctx }) {
    const prompt = ctx.argsStr || ctx.quotedText;
    if (!prompt) {
      return ctx.reply(`❌ Masukkan pertanyaan.\nContoh: *${ctx.prefix}qwen jelaskan cara kerja AI*`, {
        preview: { title: "Qwen AI", body: "Tanya apa saja" },
      });
    }

    ctx.react("⏳");
    try {
      const data = await api.get(PATH, { prompt });
      const answer = markdownToWhatsApp(pickText(data) ?? "");
      if (!answer) throw new ApiError("Jawaban kosong dari API.");

      await ctx.reply(truncate(answer, 3800), { preview: { title: "Qwen AI", body: data.model ?? "AI" } });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
