import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { markdownToWhatsApp, pickText } from "#lib/extract";
import { truncate } from "#lib/utils";
import { DEFAULT_VISION_PROMPT, askAI, attachVisual, noteOf } from "#lib/vision";

// GET /ai/free?prompt=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/ai/free";

export default definePlugin({
  name: "free",
  aliases: ["freeai"],
  category: "ai",
  description: "Tanya Free Model AI",
  usage: "free <pertanyaan> (atau reply teks, gambar, atau video)",
  limit: 1,
  async run({ ctx }) {
    const visual = await attachVisual(ctx);
    const prompt = ctx.argsStr || ctx.quotedText || (visual ? DEFAULT_VISION_PROMPT : "");
    if (!prompt) {
      return ctx.reply(`❌ Masukkan pertanyaan (atau kirim / reply gambar atau video).\nContoh: *${ctx.prefix}free jelaskan cara kerja AI*`, {
        preview: { title: "Free Model AI", body: "Tanya apa saja" },
      });
    }

    ctx.react("⏳");
    try {
      const data = await askAI("free", prompt, visual);
      const answer = markdownToWhatsApp(pickText(data) ?? "");
      if (!answer) throw new ApiError("Jawaban kosong dari API.");

      await ctx.reply(truncate(answer + noteOf(data), 3800), { preview: { title: "Free Model AI", body: data.model ?? "AI" } });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
