import { definePlugin } from "#lib/plugins";
import { config } from "#lib/config";
import { t } from "#lib/i18n";
import { sendInteractive } from "#lib/interactive";

/*
 * .sc — info script bot: gambar biasa (config/thumbnail.jpg) + teks lengkap + tombol URL ke repositori GitHub.
 * Link repositori: config.json → social.repo
 */
const REPO = "https://github.com/zavedyaid/Miyako-BA";

export default definePlugin({
  name: "sc",
  aliases: ["script", "sourcecode", "source", "repo"],
  category: "general",
  description: "Bot script info + GitHub repository link",
  usage: "sc",
  async run({ ctx, sock }) {
    const repo = config.social?.repo ?? REPO;
    const text = t("sc.text", { name: config.name.replace(/\s*-\s*/, "-"), repo });

    await sendInteractive(sock, ctx.chatId, {
      text,
      buttons: [{ type: "url", text: t("sc.button"), url: repo }],
      offer: false,
      mentions: [ctx.senderId],
      quoted: await ctx.quote(),
    });
  },
});
