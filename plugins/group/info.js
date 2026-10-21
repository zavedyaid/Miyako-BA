import { definePlugin } from "#lib/plugins";
import { groups } from "#lib/groups";
import { mentionJid } from "#lib/targets";
import { numberOf } from "#lib/utils";
import { t as tl } from "#lib/i18n";

/*
 * Buka / tutup grup, link undangan, info grup, daftar admin.
 */
const INVITE = "https://chat.whatsapp.com/";

const open = definePlugin({
  name: "opengc",
  aliases: ["opengrup"],
  category: "group",
  description: "Buka grup — semua anggota bisa chat",
  access: { group: true, admin: true, botAdmin: true },
  async run({ sock, ctx }) {
    groups.silence(ctx.chatId); // cegah pengumuman dobel dari event groups.update
    await sock.groupSettingUpdate(ctx.chatId, "not_announcement");
    await ctx.reply(tl("grp.info.1"));
  },
});

const close = definePlugin({
  name: "close",
  aliases: ["tutup", "closegc"],
  category: "group",
  description: "Tutup grup — hanya admin yang bisa chat",
  access: { group: true, admin: true, botAdmin: true },
  async run({ sock, ctx }) {
    groups.silence(ctx.chatId);
    await sock.groupSettingUpdate(ctx.chatId, "announcement");
    await ctx.reply(tl("grp.info.2"));
  },
});

const linkgc = definePlugin({
  name: "linkgc",
  aliases: ["linkgrup", "link"],
  category: "group",
  description: "Tampilkan link undangan grup",
  access: { group: true, admin: true, botAdmin: true },
  async run({ sock, ctx, group }) {
    const code = await sock.groupInviteCode(ctx.chatId);
    const { meta } = await group();
    await ctx.reply(`🔗 *${meta?.subject ?? tl("grp.info.3")}*\n${INVITE}${code}`);
  },
});

const revoke = definePlugin({
  name: "revoke",
  aliases: ["resetlink", "revokelink"],
  category: "group",
  description: "Reset link undangan grup (link lama mati)",
  access: { group: true, admin: true, botAdmin: true },
  async run({ sock, ctx }) {
    const code = await sock.groupRevokeInvite(ctx.chatId);
    await ctx.reply(tl("grp.info.4", { INVITE, code }));
  },
});

const infogc = definePlugin({
  name: "infogc",
  aliases: ["groupinfo", "infogrup"],
  category: "group",
  description: "Info lengkap grup ini",
  access: { group: true },
  async run({ ctx, group, chat }) {
    const { meta, isBotAdmin } = await group();
    if (!meta) return ctx.reply(tl("grp.info.5"));

    const admins = meta.participants.filter((p) => p.admin);
    const owner = meta.owner ?? meta.subjectOwner;
    const created = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString("id-ID", { dateStyle: "long" }) : "-";
    const yes = (v) => (v ? "✅" : "❌");

    const text = [
      `👥 *${meta.subject}*`,
      meta.desc ? `\n${meta.desc}\n` : "",
      `🆔 ${meta.id}`,
      `👤 Anggota : ${meta.participants.length}`,
      `🛡️ Admin   : ${admins.length}`,
      owner ? `👑 Pembuat : @${numberOf(owner)}` : null,
      `📅 Dibuat  : ${created}`,
      "",
      `💬 Chat    : ${meta.announce ? "hanya admin" : "semua anggota"}`,
      `✏️ Edit info: ${meta.restrict ? "hanya admin" : "semua anggota"}`,
      `➕ Tambah  : ${meta.memberAddMode === false ? "hanya admin" : "semua anggota"}`,
      `📝 Persetujuan gabung: ${yes(meta.joinApprovalMode)}`,
      `⏳ Pesan sementara   : ${meta.ephemeralDuration ? `${meta.ephemeralDuration / 86400} hari` : "mati"}`,
      "",
      `🤖 Bot admin : ${yes(isBotAdmin)}`,
      `👋 Welcome ${yes(chat?.welcome)} • 🔗 Antilink ${yes(chat?.antiLink)} • 🗑️ Anti-delete ${yes(chat?.delete)}`,
    ]
      .filter((line) => line !== null)
      .join("\n");

    await ctx.reply(text, { mentions: owner ? [owner] : [] });
  },
});

const listadmin = definePlugin({
  name: "listadmin",
  aliases: ["admins", "adminlist"],
  category: "group",
  description: "Daftar admin grup",
  access: { group: true },
  async run({ ctx, group }) {
    const { meta } = await group();
    const admins = meta?.participants?.filter((p) => p.admin) ?? [];
    if (!admins.length) return ctx.reply(tl("grp.info.6"));

    const lines = admins.map((p, i) => `${i + 1}. @${numberOf(mentionJid(p))}${p.admin === "superadmin" ? " 👑" : ""}`);
    await ctx.reply(`🛡️ *Admin ${meta.subject}* (${admins.length})\n\n${lines.join("\n")}`, {
      mentions: admins.map(mentionJid),
      preview: false,
    });
  },
});

export default [open, close, linkgc, revoke, infogc, listadmin];
