import { definePlugin } from "#lib/plugins";

export default definePlugin({
  name: "afk",
  category: "general",
  description: "Set status AFK (away from keyboard)",
  usage: "afk [alasan]",
  async run({ ctx, user, db }) {
    user.afk = Date.now();
    user.afkReason = ctx.argsStr || "tidak ada alasan";
    db.save("users");
    await ctx.reply(`😴 *AFK aktif*\n✏️ ${user.afkReason}`);
  },
});
