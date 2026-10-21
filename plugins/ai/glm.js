import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { markdownToWhatsApp, pickText } from "#lib/extract";
import { truncate } from "#lib/utils";
import { DEFAULT_VISION_PROMPT, askAI, attachVisual, noteOf } from "#lib/vision";
import { t as tl } from "#lib/i18n";

// GET /ai/glm?prompt=…   (ubah nama parameter di sini bila API memakai nama lain)
const PATH = "/ai/glm";

export default definePlugin({
  name: "glm",
  aliases: [],
  category: "ai",
  description: "Tanya GLM AI",
  usage: "glm <pertanyaan> (atau reply teks, gambar, atau video)",
  limit: 1,
  async run({ ctx }) {
    const visual = await attachVisual(ctx);
    const prompt = ctx.argsStr || ctx.quotedText || (visual ? DEFAULT_VISION_PROMPT : "");
    if (!prompt) {
      return ctx.reply(tl("ai.glm.1", { prefix: ctx.pfx }), {
        preview: { title: "GLM AI", body: tl("ai.glm.2") },
      });
    }

    ctx.react("⏳");
    try {
      const data = await askAI("glm", prompt, visual);
      const answer = markdownToWhatsApp(pickText(data) ?? "");
      if (!answer) throw new ApiError("Jawaban kosong dari API.");

      await ctx.reply(truncate(answer + noteOf(data), 3800), { preview: { title: "GLM AI", body: data.model ?? "AI" } });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
