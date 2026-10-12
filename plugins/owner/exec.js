import { exec } from "node:child_process";
import { promisify } from "node:util";
import { definePlugin } from "#lib/plugins";
import { truncate } from "#lib/utils";

const sh = promisify(exec);

export default definePlugin({
  name: "exec",
  aliases: ["sh", "$"],
  category: "owner",
  description: "Jalankan perintah shell",
  usage: "exec <perintah>",
  access: { owner: true },
  async run({ ctx }) {
    if (!ctx.hasArgs) return ctx.reply("❌ Masukkan perintah.");

    try {
      const { stdout, stderr } = await sh(ctx.argsStr, { timeout: 30_000 });
      await ctx.reply(`\`\`\`\n${truncate((stdout || stderr || "(tanpa output)").trim())}\n\`\`\``);
    } catch (err) {
      await ctx.reply(`\`\`\`\n${truncate(String(err.stderr || err.message))}\n\`\`\``);
    }
  },
});
