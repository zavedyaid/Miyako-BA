import util from "node:util";
import { definePlugin } from "#lib/plugins";
import { truncate } from "#lib/utils";

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

export default definePlugin({
  name: "eval",
  aliases: ["ev", ">"],
  category: "owner",
  description: "Jalankan kode JavaScript",
  usage: "eval <kode>",
  access: { owner: true },
  async run(env) {
    const { ctx } = env;
    if (!ctx.argsStr) return ctx.reply("❌ Masukkan kode.");

    const body = /\breturn\b|\n|;/.test(ctx.argsStr) ? ctx.argsStr : `return (${ctx.argsStr})`;
    const scope = { ...env, env };

    try {
      let result = await new AsyncFunction(...Object.keys(scope), body)(...Object.values(scope));
      if (typeof result !== "string") result = util.inspect(result, { depth: 3 });
      await ctx.reply(`\`\`\`\n${truncate(result)}\n\`\`\``);
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },
});
