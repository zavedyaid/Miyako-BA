import { definePlugin } from "#lib/plugins";
import { groups } from "#lib/groups";
import { AI_MODELS } from "#lib/autoai";
import { bare, truncate } from "#lib/utils";

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
    aliases: ["deskripsi", "description"],
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
    help: "welcome <teks|reset> — pesan anggota masuk",
    async run({ ctx, chat, db }, value) {
      if (!value) {
        return `👋 *Welcome* saat ini:\n${chat.sWelcome || "(bawaan)"}\n\nVariabel: @user @subject @count @desc @author\nContoh: ${ctx.prefix}set group welcome Halo @user, selamat datang di @subject!\nAktifkan: ${ctx.prefix}on welcome`;
      }
      chat.sWelcome = /^(reset|default)$/i.test(value) ? "" : value;
      db.save("groups");
      return chat.sWelcome ? `✅ Pesan *welcome* diganti.${chat.welcome ? "" : `\n⚠️ Fitur welcome belum aktif — nyalakan dengan ${ctx.prefix}on welcome`}` : "✅ Pesan welcome kembali ke bawaan.";
    },
  },
  goodbye: {
    aliases: ["bye", "perpisahan"],
    help: "goodbye <teks|reset> — pesan anggota keluar",
    async run({ ctx, chat, db }, value) {
      if (!value) {
        return `🚪 *Goodbye* saat ini:\n${chat.sBye || "(bawaan)"}\n\nVariabel: @user @subject @count @desc @author\nContoh: ${ctx.prefix}set group goodbye Sampai jumpa @user!\nAktifkan: ${ctx.prefix}on goodbye`;
      }
      chat.sBye = /^(reset|default)$/i.test(value) ? "" : value;
      db.save("groups");
      return chat.sBye ? `✅ Pesan *goodbye* diganti.${chat.goodbye ? "" : `\n⚠️ Fitur goodbye belum aktif — nyalakan dengan ${ctx.prefix}on goodbye`}` : "✅ Pesan goodbye kembali ke bawaan.";
    },
  },
  chat: {
    aliases: ["mode", "kirim"],
    bot: true,
    help: "chat <admin|all> — siapa yang boleh kirim pesan",
    async run({ sock, ctx }, value) {
      const mode = choice(value, ADMIN_ALL);
      if (!mode) throw new Error("Pilih: admin atau all.");
      groups.silence(ctx.chatId);
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
    aliases: ["status", "about", "info"],
    help: "bio <teks> — ganti info/bio bot (maks 139 karakter)",
    async run({ sock }, value) {
      const text = value.replace(/\s+/g, " ").trim();
      if (!text) throw new Error("Tulis bio-nya. Contoh: .set owner bio Miyako siap bertugas");
      if (text.length > 139) throw new Error(`Bio maksimal 139 karakter (sekarang ${text.length}).`);
      try {
        await sock.updateProfileStatus(text);
      } catch (err) {
        throw new Error(`WhatsApp menolak perubahan bio (${err.message || "tanpa pesan"}). Coba lagi sebentar lagi.`);
      }
      return `✅ Bio bot → *${text}*`;
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
  persona: {
    aliases: ["aipersona", "karakter"],
    help: "persona <teks|reset> — karakter AutoAI (kosong = lihat saat ini)",
    async run({ db }, value) {
      if (!value) return `🎭 *Persona AutoAI*\n${db.settings.autoAiPersona ? truncate(db.settings.autoAiPersona, 1200) : "(bawaan: Tsukiyuki Miyako)"}`;
      if (/^(reset|default)$/i.test(value)) delete db.settings.autoAiPersona;
      else db.settings.autoAiPersona = value;
      db.save("settings");
      return /^(reset|default)$/i.test(value) ? "✅ Persona AutoAI kembali ke Miyako (bawaan)." : "✅ Persona AutoAI diganti.";
    },
  },
  aimodel: {
    aliases: ["ai", "modelai"],
    help: `aimodel <${AI_MODELS.join("|")}> — AI yang dipakai AutoAI`,
    async run({ db }, value) {
      const name = value.toLowerCase();
      if (!name) return `🤖 AI AutoAI saat ini: *${db.settings.autoAiModel ?? "gemini"}*\nPilihan: ${AI_MODELS.join(", ")}`;
      if (!AI_MODELS.includes(name)) throw new Error(`Pilih salah satu: ${AI_MODELS.join(", ")}`);
      db.settings.autoAiModel = name;
      db.save("settings");
      return `✅ AutoAI sekarang memakai *${name}*.`;
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

const PRESETS = {
  setbio: "owner bio",
  setwelcome: "group welcome",
  setgoodbye: "group goodbye",
  setbye: "group goodbye",
  setname: "group name",
  setnamegc: "group name",
  setdesc: "group desc",
  setdeskripsi: "group desc",
  setppgc: "group pp",
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
    `💡 Singkatan: ${pfx}setbio, ${pfx}setwelcome, ${pfx}setgoodbye, ${pfx}setname, ${pfx}setdesc`,
    `💡 Fitur on/off (welcome, goodbye, antilink, autoai, dll) → *${pfx}on* / *${pfx}off*`,
  ].join("\n");

export default definePlugin({
  name: "set",
  aliases: ["setting", "atur", ...Object.keys(PRESETS)],
  category: "group",
  description: "Atur grup (set group …) atau bot (set owner …)",
  usage: "set <group|owner> <opsi> <nilai>",
  async run(env) {
    const { ctx, role, group } = env;

    // Singkatan: .setbio, .setwelcome, .setgoodbye, .setname, .setdesc, .setpp → ".set <lingkup> <opsi> …"
    const preset = PRESETS[ctx.command];
    // Opsi khusus owner boleh tanpa kata "owner": .set bio …  .set persona …  .set aimodel …
    const first = ctx.args[0]?.toLowerCase();
    const bareOwner = !preset && role.owner && first && !["group", "grup", "owner"].includes(first) && !find(GROUP, first) && find(OWNER, first);
    if (preset) ctx.argsStr = `${preset} ${ctx.argsStr}`.trim();
    else if (bareOwner) ctx.argsStr = `owner ${ctx.argsStr}`;

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
