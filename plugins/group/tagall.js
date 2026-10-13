import { definePlugin } from "#lib/plugins";
import { mentionJid } from "#lib/targets";
import { numberOf } from "#lib/utils";

export default definePlugin({
  name: "tagall",
  aliases: ["everyone", "all"],
  category: "group",
  description: "Mention semua anggota grup (daftar terlihat)",
  usage: "tagall [pesan]",
  access: { group: true, admin: true },
  async run({ ctx, group }) {
    const { meta } = await group();
    const members = meta?.participants ?? [];
    if (!members.length) return ctx.reply("❌ Gagal membaca daftar anggota grup.");

    const jids = members.map(mentionJid);
    const note = ctx.argsStr || ctx.quotedText;
    const text = [
      `📣 *Tag All* — ${jids.length} anggota`,
      note && `💬 ${note}`,
      "",
      ...jids.map((jid) => `◦ @${numberOf(jid)}`),
    ]
      .filter((line) => line !== undefined && line !== false && line !== "")
      .join("\n");

    await ctx.reply(text, { mentions: jids, quoted: false, preview: false });
  },
});
