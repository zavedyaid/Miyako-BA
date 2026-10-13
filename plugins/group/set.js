import { definePlugin } from "#lib/plugins";
import { bare } from "#lib/utils";

/*
 * .set <group|owner> <opsi> <nilai>
 *   group → mengatur grup ini (admin grup; bot admin untuk opsi yang mengubah grup)
 *   owner → mengatur akun bot (khusus owner)
 */

const LIMIT_SUBJECT = 100;
const LIMIT_DESC = 2048;
const EPHEMERAL = { off: 0, mati: 0, "24h": 86_400, "1d": 86_400, "7d": 604_800, "90d": 7_776_000 };

const choice = (value, map) => map[String(value ?? "").toLowerCase()];
const ADMIN_ALL = { admin: "admin", all: "all", semua: "all", member: "all" };
const ON_OFF = { on: true, off: false, aktif: true, mati: false };

const photoOf = async (ctx) => {
  const media = await ctx.fetchMedia().catch(() => null);
  return media?.kind === "image" ? media.buffer : null;
};

/* ── opsi grup ─────────────────────────────────────────────────────────── */
// bot: true = bot harus admin grup
const GROUP = {
  name: {
    aliases: ["nama", "subject", "judul"],
    bot: true,
    help: "name <teks> — ganti nama grup",
    async run({ sock, ctx }, value) {
      if (!value) throw new Error("Tulis nama barunya.");
      if (value.length > LIMIT_SUBJECT) throw new Error(`Nama grup maks ${LIMIT_SUBJECT} karakter.`);
      await sock.groupUpdateSubject(ctx.chatId, value);
      return `✅ Nama grup → *${value}*`;
    },
  },
  desc: {
    aliases: ["deskripsi", "description", "bio"],
    bot: true,
    help: "desc <teks|-> — ganti deskripsi (- untuk menghapus)",
    async run({ sock, ctx }, value) {
      if (!value) throw new Error("Tulis deskripsinya (atau - untuk menghapus).");
      if (value.length > LIMIT_DESC) throw new Error(`Deskripsi maks ${LIMIT_DESC} karakter.`);
      await sock.groupUpdateDescription(ctx.chatId, value === "-" ? undefined : value);
      return value === "-" ? "✅ Deskripsi grup dihapus." : "✅ Deskripsi grup diperbarui.";
    },
  },
  pp: {
    aliases: ["foto", "icon", "ppgc"],
    bot: true,
    help: "pp — kirim / reply gambar (pp hapus untuk menghapus foto)",
    async run({ sock, ctx }, value) {
      if (/^(hapus|remove|delete)$/i.test(value)) {
        await sock.removeProfilePicture(ctx.chatId);
        return "✅ Foto grup dihapus.";
      }
      const buffer = await photoOf(ctx);
      if (!buffer) throw new Error("Kirim atau reply gambar dengan caption perintah ini.");
      await sock.updateProfilePicture(ctx.chatId, buffer);
      return "✅ Foto grup diperbarui.";
    },
  },
  welcome: {
    aliases: ["sambutan"],
    help: "welcome <teks|reset> — pesan anggota masuk (@user @subject @count)",
    async run({ ctx, chat, db }, value) {
      if (!value) throw new Error("Tulis teksnya. Variabel: @user @subject @count");
      chat.sWelcome = /^(reset|default)$/i.test(value) ? "" : value;
      db.save("groups");
      return chat.sWelcome ? "✅ Pesan welcome diganti." : "✅ Pesan welcome kembali ke bawaan.";
    },
  },
  bye: {
    aliases: ["goodbye", "perpisahan"],
    help: "bye <teks|reset> — pesan anggota keluar (@user @subject @count)",
    async run({ chat, db }, value) {
      if (!value) throw new Error("Tulis teksnya. Variabel: @user @subject @count");
      chat.sBye = /^(reset|default)$/i.test(value) ? "" : value;
      db.save("groups");
      return chat.sBye ? "✅ Pesan bye diganti." : "✅ Pesan bye kembali ke bawaan.";
    },
  },
  chat: {
    aliases: ["mode", "kirim"],
    bot: true,
    help: "chat <admin|all> — siapa yang boleh kirim pesan",
    async run({ sock, ctx }, value) {
      const mode = choice(value, ADMIN_ALL);
      if (!mode) throw new Error("Pilih: admin atau all.");
      await sock.groupSettingUpdate(ctx.chatId, mode === "admin" ? "announcement" : "not_announcement");
      return mode === "admin" ? "🔒 Hanya admin yang bisa chat." : "🔓 Semua anggota bisa chat.";
    },
  },
  edit: {
    aliases: ["info", "ubah"],
    bot: true,
    help: "edit <admin|all> — siapa yang boleh ubah info grup",
    async run({ sock, ctx }, value) {
      const mode = choice(value, ADMIN_ALL);
      if (!mode) throw new Error("Pilih: admin atau all.");
      await sock.groupSettingUpdate(ctx.chatId, mode === "admin" ? "locked" : "unlocked");
      return mode === "admin" ? "🔒 Info grup hanya bisa diubah admin." : "🔓 Semua anggota bisa ubah info grup.";
    },
  },
  add: {
    aliases: ["tambah", "member"],
    bot: true,
    help: "add <admin|all> — siapa yang boleh tambah anggota",
    async run({ sock, ctx }, value) {
      const mode = choice(value, ADMIN_ALL);
      if (!mode) throw new Error("Pilih: admin atau all.");
      await sock.groupMemberAddMode(ctx.chatId, mode === "admin" ? "admin_add" : "all_member_add");
      return mode === "admin" ? "🔒 Hanya admin yang bisa tambah anggota." : "🔓 Semua anggota bisa tambah anggota.";
    },
  },
  approval: {
    aliases: ["persetujuan", "join"],
    bot: true,
    help: "approval <on|off> — persetujuan admin untuk anggota baru",
    async run({ sock, ctx }, value) {
      const on = choice(value, ON_OFF);
      if (on === undefined) throw new Error("Pilih: on atau off.");
      await sock.groupJoinApprovalMode(ctx.chatId, on ? "on" : "off");
      return on ? "✅ Persetujuan anggota baru *aktif*." : "✅ Persetujuan anggota baru *mati*.";
    },
  },
  ephemeral: {
    aliases: ["sementara", "disappearing"],
    bot: true,
    help: "ephemeral <off|24h|7d|90d> — pesan sementara",
    async run({ sock, ctx }, value) {
      const seconds = choice(value, EPHEMERAL);
      if (seconds === undefined) throw new Error("Pilih: off, 24h, 7d, atau 90d.");
      await sock.groupToggleEphemeral(ctx.chatId, seconds);
      return seconds ? `✅ Pesan sementara: *${value}*` : "✅ Pesan sementara dimatikan.";
    },
  },
};

/* ── opsi owner ────────────────────────────────────────────────────────── */
const OWNER = {
  name: {
    aliases: ["nama"],
    help: "name <teks> — ganti nama profil bot",
    async run({ sock }, value) {
      if (!value) throw new Error("Tulis nama barunya.");
      await sock.updateProfileName(value);
      return `✅ Nama bot → *${value}*`;
    },
  },
  bio: {
    aliases: ["status", "about"],
    help: "bio <teks> — ganti info/bio bot",
    async run({ sock }, value) {
      if (!value) throw new Error("Tulis bio-nya.");
      await sock.updateProfileStatus(value);
      return "✅ Bio bot diperbarui.";
    },
  },
  pp: {
    aliases: ["foto"],
    help: "pp — kirim / reply gambar (pp hapus untuk menghapus)",
    async run({ sock, ctx }, value) {
      const me = bare(sock.user?.id);
      if (/^(hapus|remove|delete)$/i.test(value)) {
        await sock.removeProfilePicture(me);
        return "✅ Foto profil bot dihapus.";
      }
      const buffer = await photoOf(ctx);
      if (!buffer) throw new Error("Kirim atau reply gambar dengan caption perintah ini.");
      await sock.updateProfilePicture(me, buffer);
      return "✅ Foto profil bot diperbarui.";
    },
  },
  mode: {
    aliases: [],
    help: "mode <self|public> — self = hanya owner yang bisa pakai bot",
    async run({ db }, value) {
      const mode = String(value).toLowerCase();
      if (!["self", "public"].includes(mode)) throw new Error("Pilih: self atau public.");
      db.settings.selfMode = mode === "self";
      db.save("settings");
      return `✅ Mode bot: *${mode.toUpperCase()}*`;
    },
  },
};

const find = (table, name) => {
  const key = String(name ?? "").toLowerCase();
  return Object.entries(table).find(([k, v]) => k === key || v.aliases.includes(key))?.[1];
};

const helpText = (pfx, isOwner) =>
  [
    `⚙️ *Pengaturan* — ${pfx}set <group|owner> <opsi> <nilai>`,
    "",
    "👥 *group* (admin grup, dipakai di dalam grup)",
    ...Object.values(GROUP).map((o) => `• ${pfx}set group ${o.help}`),
    "",
    `👑 *owner* (khusus owner${isOwner ? "" : " — kamu bukan owner"})`,
    ...Object.values(OWNER).map((o) => `• ${pfx}set owner ${o.help}`),
    "",
    `💡 Fitur on/off (welcome, antilink, dll) → *${pfx}on* / *${pfx}off*`,
  ].join("\n");

export default definePlugin({
  name: "set",
  aliases: ["setting", "atur"],
  category: "group",
  description: "Atur grup (set group …) atau bot (set owner …)",
  usage: "set <group|owner> <opsi> <nilai>",
  async run(env) {
    const { ctx, role, group } = env;
    const match = ctx.argsStr.match(/^(\S+)(?:\s+(\S+))?(?:\s+([\s\S]*))?$/);
    const [scope, option, value = ""] = match ? [match[1].toLowerCase(), match[2], (match[3] ?? "").trim()] : [];

    if (!["group", "grup", "owner"].includes(scope)) return ctx.reply(helpText(ctx.prefix, role.owner));
    if (!option) return ctx.reply(helpText(ctx.prefix, role.owner));

    if (scope === "owner") {
      if (!role.owner) return ctx.reply("❌ Opsi *owner* khusus Owner bot.");
      const entry = find(OWNER, option);
      if (!entry) return ctx.reply(`❌ Opsi *${option}* tidak ada.\n\n${helpText(ctx.prefix, true)}`);
      try {
        return await ctx.reply(await entry.run(env, value));
      } catch (err) {
        return ctx.reply(`❌ ${err.message}`);
      }
    }

    // scope group
    if (!ctx.isGroup) return ctx.reply("👥 Opsi *group* hanya bisa dipakai di dalam grup.");
    const entry = find(GROUP, option);
    if (!entry) return ctx.reply(`❌ Opsi *${option}* tidak ada.\n\n${helpText(ctx.prefix, role.owner)}`);

    const { isAdmin, isBotAdmin } = await group();
    if (!isAdmin && !role.owner) return ctx.reply("🛡️ Perintah ini khusus *admin grup*.");
    if (entry.bot && !isBotAdmin) return ctx.reply("🤖 Jadikan bot sebagai *admin grup* dulu.");

    try {
      await ctx.reply(await entry.run(env, value));
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },
});
