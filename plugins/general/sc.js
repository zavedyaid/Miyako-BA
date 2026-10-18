import { definePlugin } from "#lib/plugins";
import { config } from "#lib/config";
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
  description: "Info script bot + link repositori GitHub",
  usage: "sc",
  async run({ ctx, sock }) {
    const repo = config.social?.repo ?? REPO;
    const text = [
      `*${config.name.replace(/\s*-\s*/, "-")}*`,
      "> Bot WhatsApp modular berbasis plugin di atas @zavedyaid/baileys, dengan hot-reload tanpa build-step, pesan interaktif (list, katalog, promo, forward dari channel), router API api.zavedya.id, serta sistem limit, level, dan EXP bawaan.",
      "",
      "> Fitur?",
      "> Banyak Seperti",
      "> Play, Tiktok, swgc, dll",
      "",
      "> Author",
      "> - ZavedyaID ( OWNER / DEVELOPER)",
      "> - RullzFuqi ( Base / Ikut serta pembuatan )",
      "> - ZavedyaApi ( Sebagai Router Semua Fitur Bot )",
      "",
      "Note: Btw Ini SC masih sedikit fiturnya, Support Kami Terus yahh! Jika Menemukan bug tolong lapor kepada kami!!!",
      "",
      "*Jangan Lupa Starsnya ya*",
      repo,
    ].join("\n");

    await sendInteractive(sock, ctx.chatId, {
      text,
      buttons: [{ type: "url", text: "⭐ GitHub Repository", url: repo }],
      offer: false,
      mentions: [ctx.senderId],
      quoted: await ctx.quote(),
    });
  },
});
