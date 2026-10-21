import { definePlugin } from "#lib/plugins";
import { t as tl } from "#lib/i18n";

export default definePlugin({
  name: "setmode",
  aliases: ["mode"],
  category: "owner",
  description: "Ubah mode bot: self (hanya owner) atau public",
  usage: "setmode <self|public>",
  access: { owner: true },
  async run({ ctx, db }) {
    const mode = ctx.args[0]?.toLowerCase();
    if (!["self", "public"].includes(mode)) return ctx.reply(tl("own.setmode.1", { prefix: ctx.pfx }));

    db.settings.selfMode = mode === "self";
    db.save("settings");
    await ctx.reply(`✅ Mode bot: *${mode.toUpperCase()}*`);
  },
});
