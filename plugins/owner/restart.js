import { spawn } from "node:child_process";
import { definePlugin } from "#lib/plugins";

export default definePlugin({
  name: "restart",
  category: "owner",
  description: "Restart bot",
  access: { owner: true },
  async run({ ctx, db }) {
    await ctx.reply("🔄 Restarting…");
    db.flush();

    if (!process.env.pm_id && !process.env.NODEMON) {
      spawn(process.argv[0], process.argv.slice(1), { detached: true, stdio: "inherit" }).unref();
    }
    setTimeout(() => process.exit(0), 1000);
  },
});
