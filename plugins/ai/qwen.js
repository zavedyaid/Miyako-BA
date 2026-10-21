import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { markdownToWhatsApp, pickText } from "#lib/extract";
import { truncate } from "#lib/utils";
import { DEFAULT_VISION_PROMPT, askAI, attachVisual, noteOf } from "#lib/vision";
import { t as tl } from "#lib/i18n";

// GET /ai/qwen?prompt=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/ai/qwen";

export default definePlugin({
  name: "qwen",
  aliases: [],
  category: "ai",
  description: "Tanya Qwen AI",
  usage: "qwen <pertanyaan> (atau reply teks, gambar, atau video)",
  limit: 1,
  async run({ ctx }) {
    const visual = await attachVisual(ctx);
    const prompt = ctx.argsStr || ctx.quotedText || (visual ? DEFAULT_VISION_PROMPT : "");
    if (!prompt) {
      return ctx.reply(tl("ai.qwen.1", { prefix: ctx.pfx }), {
        preview: { title: "Qwen AI", body: tl("ai.qwen.2") },
      });
    }

    ctx.react("⏳");
    try {
      const data = await askAI("qwen", prompt, visual);
      const answer = markdownToWhatsApp(pickText(data) ?? "");
      if (!answer) throw new ApiError("Jawaban kosong dari API.");

      await ctx.reply(truncate(answer + noteOf(data), 3800), { preview: { title: "Qwen AI", body: data.model ?? "AI" } });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
