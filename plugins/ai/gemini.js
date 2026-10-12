import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { truncate } from "#lib/utils";

const MODEL = "gemini-3.6-flash";

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
  usage: "gemini <pertanyaan> (atau reply teks)",
  limit: 1,
  async run({ ctx }) {
    const prompt = ctx.argsStr || ctx.quotedText;
    if (!prompt) {
      return ctx.reply(`❌ Masukkan pertanyaan.\nContoh: *${ctx.prefix}gemini jelaskan cara kerja AI*`, {
        preview: { title: "Gemini", body: "Tanya apa saja" },
      });
    }

    ctx.react("⏳");
    try {
      const data = await api.get("/ai/gemini", {
        prompt,
        model: MODEL,
      });
      const answer = toWhatsApp(String(data.text ?? ""));
      if (!answer) throw new ApiError("Jawaban kosong dari API.");

      await ctx.reply(truncate(answer, 3800), { preview: { title: "Gemini", body: data.model ?? "AI" } });
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
