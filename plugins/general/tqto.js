import { definePlugin } from "#lib/plugins";
import { config } from "#lib/config";

/*
 * Thanks To — ucapan terima kasih.
 * Kredit Baileys mengikuti rantai yang ditulis di README @zavedyaid/baileys; jangan dihapus atau diubah.
 */
export default definePlugin({
  name: "tqto",
  aliases: ["thanksto", "credits", "kredit", "tq"],
  category: "general",
  description: "Terima kasih kepada semua yang berjasa",
  usage: "tqto",
  async run({ ctx }) {
    const github = config.social?.github ?? "https://github.com/ZavedyaID";
    const website = config.social?.website ?? "https://zavedya.id";
    const apiHost = String(config.api?.baseUrl ?? "https://api.zavedya.id").replace(/^https?:\/\//, "");
    const dev = config.owner ?? "ZavedyaID";

    const text = [
      "🤲 *THANKS TO*",
      `_${config.name} v${config.version}_`,
      "",
      "🕋 *Allah SWT*",
      "• Atas segala nikmat, kemudahan, dan kesempatan sehingga bot ini bisa dibuat dan dipakai. Alhamdulillah.",
      "",
      "👨‍💻 *Developer*",
      `• ${dev}`,
      `• ${github}`,
      "",
      "🧱 *Base*",
      "• RullzFuqi — base dari bot ini",
      "• https://github.com/RullzFuqi",
      "",
      "🌐 *Penyedia API*",
      `• ZavedyaApi's — ${apiHost}`,
      `• Zavedya CDN — cdn.zavedya.id`,
      `• ${website}`,
      "",
      "⚙️ *Baileys*",
      "• @zavedyaid/baileys — ZavedyaID (connecting semuanya)",
      "• itsliaaa/baileys — Lia Wynn (enhanced fork: pesan interaktif, album, dll)",
      "• WhiskeySockets/Baileys — library asli",
      "• purpshell, jlucaso1, adiwajshing — maintainer & kontributor Baileys",
      "• WPP Connect (wa-proto) — definisi Protocol Buffer",
      "• itsreimau — perbaikan updateBlockStatus",
      "",
      "💖 Dan seluruh pengguna yang sudah memakai bot ini.",
    ].join("\n");

    await ctx.reply(text, { preview: { title: "Thanks To", body: `${config.name} • ${dev}` } });
  },
});
