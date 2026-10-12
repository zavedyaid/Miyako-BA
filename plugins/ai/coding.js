import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { markdownToWhatsApp, pickText } from "#lib/extract";
import { truncate } from "#lib/utils";

// GET /ai/coding?prompt=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/ai/coding";

export default definePlugin({
  name: "coding",
  aliases: ["code"],
  category: "ai",
  description: "Tanya Coding High AI",
  usage: "coding <pertanyaan> (atau reply teks)",
  limit: 1,
  async run({ ctx }) {
    const prompt = ctx.argsStr || ctx.quotedText;
    if (!prompt) {
      return ctx.reply(`❌ Masukkan pertanyaan.\nContoh: *${ctx.prefix}coding jelaskan cara kerja AI*`, {
        preview: { title: "Coding High AI", body: "Tanya apa saja" },
      });
    }

    ctx.react("⏳");
    try {
      const data = await api.get(PATH, { prompt });
      const answer = markdownToWhatsApp(pickText(data) ?? "");
      if (!answer) throw new ApiError("Jawaban kosong dari API.");

      await ctx.reply(truncate(answer, 3800), { preview: { title: "Coding High AI", body: data.model ?? "AI" } });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
