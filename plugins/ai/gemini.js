import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { truncate } from "#lib/utils";
import { DEFAULT_VISION_PROMPT, askAI, attachVisual, noteOf } from "#lib/vision";
import { t as tl } from "#lib/i18n";

// Markdown Gemini → format WhatsApp: **tebal** → *tebal*, # Judul → *Judul*, "* " → "• ".
const toWhatsApp = (text) =>
  text
    .replace(/\r/g, "")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\*\*(.+?)\*\*/gs, "*$1*")
    .replace(/^(\s*)[*-]\s+/gm, "$1• ")
    .trim();

export default definePlugin({
  name: "gemini",
  aliases: ["gem"],
  category: "ai",
  description: "Tanya Google Gemini",
  usage: "gemini <pertanyaan> (atau reply teks, gambar, atau video)",
  limit: 1,
  async run({ ctx }) {
    const visual = await attachVisual(ctx);
    const prompt = ctx.argsStr || ctx.quotedText || (visual ? DEFAULT_VISION_PROMPT : "");
    if (!prompt) {
      return ctx.reply(tl("ai.gemini.1", { prefix: ctx.pfx }), {
        preview: { title: "Gemini", body: tl("ai.gemini.2") },
      });
    }

    ctx.react("⏳");
    try {
      const data = await askAI("gemini", prompt, visual);
      const answer = toWhatsApp(String(data.text ?? ""));
      if (!answer) throw new ApiError("Jawaban kosong dari API.");

      await ctx.reply(truncate(answer + noteOf(data), 3800), { preview: { title: "Gemini", body: data.model ?? "AI" } });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
