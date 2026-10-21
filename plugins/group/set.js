import { lex } from "#lib/i18n";
import { definePlugin } from "#lib/plugins";
import { groups } from "#lib/groups";
import { AI_MODELS } from "#lib/autoai";
import { bare, truncate } from "#lib/utils";
import { db as store } from "#lib/database";
import { MAX_LEVEL } from "#lib/levels";
import { parseAmount, parseDuration } from "#lib/redeem";
import { STAMINA_MAX, getRpg, statsOf } from "#lib/rpg";
import { tr } from "#lib/tr";
import { numberOf } from "#lib/utils";
import { t as tl } from "#lib/i18n";

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
      if (!value) throw new Error(tl("st4.1"));
      if (value.length > LIMIT_SUBJECT) throw new Error(tl("st4.2", { LIMIT_SUBJECT }));
      await sock.groupUpdateSubject(ctx.chatId, value);
      return tl("st4.3", { value });
    },
  },
  desc: {
    aliases: ["deskripsi", "description"],
    bot: true,
    help: "desc <teks|-> — ganti deskripsi (- untuk menghapus)",
    async run({ sock, ctx }, value) {
      if (!value) throw new Error(tl("st4.4"));
      if (value.length > LIMIT_DESC) throw new Error(tl("st4.5", { LIMIT_DESC }));
      await sock.groupUpdateDescription(ctx.chatId, value === "-" ? undefined : value);
      return value === "-" ? tl("st4.6") : tl("st4.7");
    },
  },
  pp: {
    aliases: ["foto", "icon", "ppgc"],
    bot: true,
    help: "pp — kirim / reply gambar (pp hapus untuk menghapus foto)",
    async run({ sock, ctx }, value) {
      if (/^(hapus|remove|delete)$/i.test(value)) {
        await sock.removeProfilePicture(ctx.chatId);
        return tl("st4.8");
      }
      const buffer = await photoOf(ctx);
      if (!buffer) throw new Error(tl("st4.9"));
      await sock.updateProfilePicture(ctx.chatId, buffer);
      return tl("st4.10");
    },
  },
  welcome: {
    aliases: ["sambutan"],
    help: "welcome <teks|reset> — pesan anggota masuk",
    async run({ ctx, chat, db }, value) {
      if (!value) {
        return tl("st4.12", { v: chat.sWelcome || tl("st4.11"), pfx: ctx.pfx, pfx1: ctx.pfx });
      }
      chat.sWelcome = /^(reset|default)$/i.test(value) ? "" : value;
      db.save("groups");
      return chat.sWelcome ? tl("st4.14", { v: chat.welcome ? "" : tl("st4.13", { pfx: ctx.pfx }) }) : tl("st4.15");
    },
  },
  goodbye: {
    aliases: ["bye", "perpisahan"],
    help: "goodbye <teks|reset> — pesan anggota keluar",
    async run({ ctx, chat, db }, value) {
      if (!value) {
        return tl("st4.17", { v: chat.sBye || tl("st4.16"), pfx: ctx.pfx, pfx1: ctx.pfx });
      }
      chat.sBye = /^(reset|default)$/i.test(value) ? "" : value;
      db.save("groups");
      return chat.sBye ? tl("st4.19", { v: chat.goodbye ? "" : tl("st4.18", { pfx: ctx.pfx }) }) : tl("st4.20");
    },
  },
  chat: {
    aliases: ["mode", "kirim"],
    bot: true,
    help: "chat <admin|all> — siapa yang boleh kirim pesan",
    async run({ sock, ctx }, value) {
      const mode = choice(value, ADMIN_ALL);
      if (!mode) throw new Error(tl("st4.21"));
      groups.silence(ctx.chatId);
      await sock.groupSettingUpdate(ctx.chatId, mode === "admin" ? "announcement" : "not_announcement");
      return mode === "admin" ? tl("st4.22") : tl("st4.23");
    },
  },
  edit: {
    aliases: ["info", "ubah"],
    bot: true,
    help: "edit <admin|all> — siapa yang boleh ubah info grup",
    async run({ sock, ctx }, value) {
      const mode = choice(value, ADMIN_ALL);
      if (!mode) throw new Error(tl("st4.24"));
      await sock.groupSettingUpdate(ctx.chatId, mode === "admin" ? "locked" : "unlocked");
      return mode === "admin" ? tl("st4.25") : tl("st4.26");
    },
  },
  add: {
    aliases: ["tambah", "member"],
    bot: true,
    help: "add <admin|all> — siapa yang boleh tambah anggota",
    async run({ sock, ctx }, value) {
      const mode = choice(value, ADMIN_ALL);
      if (!mode) throw new Error(tl("st4.27"));
      await sock.groupMemberAddMode(ctx.chatId, mode === "admin" ? "admin_add" : "all_member_add");
      return mode === "admin" ? tl("st4.28") : tl("st4.29");
    },
  },
  approval: {
    aliases: ["persetujuan", "join"],
    bot: true,
    help: "approval <on|off> — persetujuan admin untuk anggota baru",
    async run({ sock, ctx }, value) {
      const on = choice(value, ON_OFF);
      if (on === undefined) throw new Error(tl("st4.30"));
      await sock.groupJoinApprovalMode(ctx.chatId, on ? "on" : "off");
      return on ? tl("st4.31") : tl("st4.32");
    },
  },
  ephemeral: {
    aliases: ["sementara", "disappearing"],
    bot: true,
    help: "ephemeral <off|24h|7d|90d> — pesan sementara",
    async run({ sock, ctx }, value) {
      const seconds = choice(value, EPHEMERAL);
      if (seconds === undefined) throw new Error(tl("st4.33"));
      await sock.groupToggleEphemeral(ctx.chatId, seconds);
      return seconds ? tl("st4.34", { value }) : tl("st4.35");
    },
  },
};

/* ── opsi owner ────────────────────────────────────────────────────────── */
const OWNER = {
  name: {
    aliases: ["nama"],
    help: "name <teks> — ganti nama profil bot",
    async run({ sock }, value) {
      if (!value) throw new Error(tl("st4.36"));
      await sock.updateProfileName(value);
      return tl("st4.37", { value });
    },
  },
  bio: {
    aliases: ["status", "about", "info"],
    help: "bio <teks> — ganti info/bio bot (maks 139 karakter)",
    async run({ sock }, value) {
      const text = value.replace(/\s+/g, " ").trim();
      if (!text) throw new Error(tl("st4.38"));
      if (text.length > 139) throw new Error(tl("st4.39", { length: text.length }));
      try {
        await sock.updateProfileStatus(text);
      } catch (err) {
        throw new Error(tl("st4.41", { v: err.message || tl("st4.40") }));
      }
      return tl("st4.42", { text });
    },
  },
  pp: {
    aliases: ["foto"],
    help: "pp — kirim / reply gambar (pp hapus untuk menghapus)",
    async run({ sock, ctx }, value) {
      const me = bare(sock.user?.id);
      if (/^(hapus|remove|delete)$/i.test(value)) {
        await sock.removeProfilePicture(me);
        return tl("st4.43");
      }
      const buffer = await photoOf(ctx);
      if (!buffer) throw new Error(tl("st4.44"));
      await sock.updateProfilePicture(me, buffer);
      return tl("st4.45");
    },
  },
  persona: {
    aliases: ["aipersona", "karakter"],
    help: "persona <teks|reset> — karakter AutoAI (kosong = lihat saat ini)",
    async run({ db }, value) {
      if (!value) return tl("st4.47", { v: db.settings.autoAiPersona ? truncate(db.settings.autoAiPersona, 1200) : tl("st4.46") });
      if (/^(reset|default)$/i.test(value)) delete db.settings.autoAiPersona;
      else db.settings.autoAiPersona = value;
      db.save("settings");
      return /^(reset|default)$/i.test(value) ? tl("st4.48") : tl("st4.49");
    },
  },
  aimodel: {
    aliases: ["ai", "modelai"],
    get help() { return `aimodel <${AI_MODELS.join("|")}> — ${lex("AI yang dipakai AutoAI")}`; },
    async run({ db }, value) {
      const name = value.toLowerCase();
      if (!name) return tl("st4.50", { v: db.settings.autoAiModel ?? "gemini", v1: AI_MODELS.join(", ") });
      if (!AI_MODELS.includes(name)) throw new Error(tl("st4.51", { v: AI_MODELS.join(", ") }));
      db.settings.autoAiModel = name;
      db.save("settings");
      return tl("st4.52", { name });
    },
  },
  autoread: {
    aliases: ["autobaca", "read"],
    help: "autoread <all|group|private|off> — tandai pesan masuk sudah dibaca",
    async run({ db, config }, value) {
      const choice = { all: "all", semua: "all", on: "all", group: "group", grup: "group", private: "private", pribadi: "private", off: false, mati: false }[value.toLowerCase()];
      if (choice === undefined) {
        const now = config.features?.autoRead;
        return tl("st4.53", { v: now || "off" });
      }
      (config.features ??= {}).autoRead = choice;
      (db.settings.features ??= {}).autoRead = choice;
      db.save("settings");
      return choice ? tl("st4.57", { v: choice === "all" ? tl("st4.54") : choice === "group" ? tl("st4.55") : tl("st4.56") }) : tl("st4.58");
    },
  },
  cardstyle: {
    aliases: ["gayakartu", "card"],
    help: "cardstyle <preview|image> — kartu welcome/goodbye/level-up sebagai link preview atau gambar biasa",
    async run({ db }, value) {
      const style = value.toLowerCase();
      if (!["preview", "image"].includes(style)) return tl("st4.59", { v: db.settings.cardStyle ?? "preview" });
      db.settings.cardStyle = style;
      db.save("settings");
      return tl("st4.62", { v: style === "preview" ? tl("st4.60") : tl("st4.61") });
    },
  },
  mode: {
    aliases: [],
    help: "mode <self|public> — self = hanya owner yang bisa pakai bot",
    async run({ db }, value) {
      const mode = String(value).toLowerCase();
      if (!["self", "public"].includes(mode)) throw new Error(tl("st4.63"));
      db.settings.selfMode = mode === "self";
      db.save("settings");
      return tl("st4.64", { v: mode.toUpperCase() });
    },
  },
};

/* ── set nilai pemain (owner): .set <limit|gold|diamond|bank|level|rpglevel|exp|xp|hp|stamina|premium> [@tag] <angka|+n|-n|max> ── */
const RPG_MAX = 100;
// field: [ambil nilai, tulis nilai, batas bawah, batas atas]
const FIELDS = {
  limit: { aliases: ["limitku"], get: (u) => u.limit ?? 0, put: (u, v) => (u.limit = v), min: 0, max: 999_999_999 },
  gold: { aliases: ["koin", "dompet"], get: (u) => getRpg(u).gold, put: (u, v) => (getRpg(u).gold = v), min: 0, max: 999_999_999_999 },
  diamond: { aliases: ["berlian", "dm"], get: (u) => getRpg(u).diamond, put: (u, v) => (getRpg(u).diamond = v), min: 0, max: 999_999_999 },
  bank: { aliases: ["saldo", "tabungan"], get: (u) => getRpg(u).bank, put: (u, v) => (getRpg(u).bank = v), min: 0, max: 999_999_999_999 },
  level: { aliases: ["lvl", "levelbot"], get: (u) => u.level ?? 1, put: (u, v) => { u.level = v; u.exp = 0; }, min: 1, max: MAX_LEVEL },
  rpglevel: { aliases: ["rpglvl", "levelrpg"], get: (u) => getRpg(u).lvl, put: (u, v) => { const r = getRpg(u); r.lvl = v; r.xp = 0; r.hp = statsOf(r).maxHp; }, min: 1, max: RPG_MAX },
  exp: { aliases: ["expbot"], get: (u) => u.exp ?? 0, put: (u, v) => (u.exp = v), min: 0, max: 999_999_999 },
  xp: { aliases: ["rpgxp"], get: (u) => getRpg(u).xp, put: (u, v) => (getRpg(u).xp = v), min: 0, max: 999_999_999 },
  hp: { aliases: ["darah"], get: (u) => getRpg(u).hp, put: (u, v) => (getRpg(u).hp = v), min: 1, max: 999_999 },
  stamina: { aliases: ["energi"], get: (u) => getRpg(u).stamina, put: (u, v) => { const r = getRpg(u); r.stamina = v; r.t = Date.now(); }, min: 0, max: STAMINA_MAX },
};
const playerField = (name, field) => ({
  aliases: field.aliases,
  help: `${name} [@tag] <angka|+n|-n|max> — ubah ${name} pemain (tanpa tag = dirimu)`,
  async run({ ctx }, value) {
    const targetId = ctx.mentionedJid[0] ?? ctx.quotedSender ?? ctx.senderId;
    const token = value.split(/\s+/).find((x) => x && !x.startsWith("@"));
    if (!token) throw new Error(tr(`Format: .set ${name} [@tag] <angka|+n|-n|max>`, `Usage: .set ${name} [@tag] <number|+n|-n|max>`));
    const user = store.user(targetId), before = field.get(user);
    let next;
    if (/^(max|maks|full)$/i.test(token)) next = field.max;
    else {
      const sign = /^[+-]/.test(token) ? token[0] : "", n = parseAmount(token.replace(/^[+-]/, ""));
      if (n === null) throw new Error(tr("Angka tidak valid.", "Invalid number."));
      next = sign === "+" ? before + n : sign === "-" ? before - n : n;
    }
    next = Math.min(field.max, Math.max(field.min, Math.round(next)));
    field.put(user, next);
    store.save("users");
    return tr(`✅ ${name} @${numberOf(targetId)}: ${before} → *${next}*`, `✅ ${name} for @${numberOf(targetId)}: ${before} → *${next}*`);
  },
});
const PLAYER_OPTIONS = Object.fromEntries(Object.entries(FIELDS).map(([name, f]) => [name, playerField(name, f)]));
PLAYER_OPTIONS.premium = {
  aliases: ["prem", "vip"],
  help: "premium [@tag] <hari|perm|off> — atur premium pemain",
  async run({ ctx }, value) {
    const targetId = ctx.mentionedJid[0] ?? ctx.quotedSender ?? ctx.senderId;
    const token = value.split(/\s+/).find((x) => x && !x.startsWith("@"));
    if (!token) throw new Error(tr("Format: .set premium [@tag] <hari|perm|off>", "Usage: .set premium [@tag] <days|perm|off>"));
    const user = store.user(targetId);
    if (/^(off|mati|0)$/i.test(token)) user.premium = { on: false, expiredAt: 0 };
    else {
      const ms = parseDuration(token);
      if (ms === null) throw new Error(tr("Durasi tidak valid.", "Invalid duration."));
      user.premium = { on: true, expiredAt: ms < 0 ? 0 : Date.now() + ms };
    }
    store.save("users");
    return tr(`✅ Premium @${numberOf(targetId)}: ${user.premium.on ? (user.premium.expiredAt ? "aktif" : "permanen") : "mati"}`, `✅ Premium for @${numberOf(targetId)}: ${user.premium.on ? (user.premium.expiredAt ? "active" : "permanent") : "off"}`);
  },
};

Object.assign(OWNER, PLAYER_OPTIONS);

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
    tl("st3.1", { pfx }),
    "",
    tl("st3.2"),
    ...Object.values(GROUP).map((o) => tl("st3.3", { pfx, help: lex(o.help) })),
    "",
    tl("st3.5", { v: isOwner ? "" : tl("st3.4") }),
    ...Object.values(OWNER).map((o) => tl("st3.6", { pfx, help: lex(o.help) })),
    "",
    tl("st3.7", { pfx, pfx1: pfx, pfx2: pfx, pfx3: pfx, pfx4: pfx }),
    tl("st3.8", { pfx, pfx1: pfx }),
  ].join("\n");

export default definePlugin({
  name: "set",
  ownHelp: true,
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

    if (!["group", "grup", "owner"].includes(scope)) return ctx.reply(helpText(ctx.pfx, role.owner));
    if (!option) return ctx.reply(helpText(ctx.pfx, role.owner));

    if (scope === "owner") {
      if (!role.owner) return ctx.reply(tl("st4.65"));
      const entry = find(OWNER, option);
      if (!entry) return ctx.reply(tl("grp.set.1", { option, v: helpText(ctx.pfx, true) }));
      try {
        return await ctx.reply(await entry.run(env, value));
      } catch (err) {
        return ctx.reply(`❌ ${err.message}`);
      }
    }

    // scope group
    if (!ctx.isGroup) return ctx.reply(tl("grp.set.2"));
    const entry = find(GROUP, option);
    if (!entry) return ctx.reply(tl("grp.set.3", { option, v: helpText(ctx.pfx, role.owner) }));

    const { isAdmin, isBotAdmin } = await group();
    if (!isAdmin && !role.owner) return ctx.reply(tl("grp.set.4"));
    if (entry.bot && !isBotAdmin) return ctx.reply(tl("grp.set.5"));

    try {
      await ctx.reply(await entry.run(env, value));
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },
});
