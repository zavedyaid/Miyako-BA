import { definePlugin } from "#lib/plugins";
import { autoReply, clearHistory } from "#lib/autoai";

/*
 * AutoAI (karakter Tsukiyuki Miyako) — balas otomatis tanpa command.
 *   Nyalakan : .on owner autoai (chat pribadi)  •  .on autoai di grup (khusus owner)
 *   Atur     : .set owner persona <teks|reset>  •  .set owner aimodel <nama>
 *   .resetai : hapus ingatan percakapan di chat ini
 */
const passive = definePlugin({
  name: "autoai",
  passive(env) {
    void autoReply(env); // tidak di-await: jawaban AI butuh beberapa detik, jangan menahan pesan lain
  },
});

const reset = definePlugin({
  name: "resetai",
  aliases: ["clearai", "lupakan"],
  category: "ai",
  description: "Hapus ingatan percakapan AutoAI di chat ini",
  async run({ ctx }) {
    clearHistory(ctx.chatId);
    await ctx.reply("🐰 Baik. Percakapan sebelumnya sudah kulupakan.");
  },
});

export default [passive, reset];
