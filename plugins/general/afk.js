import { definePlugin } from "#lib/plugins";
import { t as tl } from "#lib/i18n";

export default definePlugin({
  name: "afk",
  category: "general",
  description: "Set status AFK (away from keyboard)",
  usage: "afk [alasan]",
  async run({ ctx, user, db }) {
    user.afk = Date.now();
    user.afkReason = ctx.argsStr || tl("af3.1");
    db.save("users");
    await ctx.reply(tl("gen.afk.1", { afkReason: user.afkReason }));
  },
});
