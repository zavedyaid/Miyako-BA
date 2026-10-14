import { definePlugin } from "#lib/plugins";

/*
 * .on <fitur> / .off <fitur>
 *   Di grup (admin grup) → fitur grup. Tulis `.on group <fitur>` bila mau eksplisit.
 *   .on owner <fitur>    → fitur bot (khusus owner), bisa dari mana saja.
 *   .on / .off (tanpa fitur) → daftar fitur beserta statusnya.
 */

// ── fitur grup (disimpan di database/groups.json) ──────────────────────────
const GROUP_FEATURES = {
  welcome: {
    aliases: ["sambutan"],
    help: "Sambutan anggota masuk (teks: .set group welcome)",
    get: (chat) => chat.welcome,
    set: (chat, on) => (chat.welcome = on),
  },
  goodbye: {
    aliases: ["bye", "perpisahan"],
    help: "Pesan anggota keluar / dikeluarkan (teks: .set group goodbye)",
    get: (chat) => chat.goodbye,
    set: (chat, on) => (chat.goodbye = on),
  },
  adminnotif: {
    aliases: ["promote", "demote", "notifadmin", "notif"],
    help: "Notif saat ada yang dijadikan / dicabut admin",
    get: (chat) => chat.adminNotif,
    set: (chat, on) => (chat.adminNotif = on),
  },
  autoai: {
    aliases: ["ai"],
    help: "AutoAI Miyako membalas otomatis di grup ini (khusus owner)",
    ownerOnly: true,
    get: (chat) => chat.autoAi,
    set: (chat, on) => (chat.autoAi = on),
  },
  antilink: {
    aliases: ["anti-link"],
    help: "Hapus link & keluarkan setelah 3x peringatan (bot harus admin)",
    needsBotAdmin: true,
    get: (chat) => chat.antiLink,
    set: (chat, on) => (chat.antiLink = on),
  },
  delete: {
    aliases: ["antidelete", "antihapus"],
    help: "Tampilkan pesan yang dihapus anggota",
    get: (chat) => chat.delete,
    set: (chat, on) => (chat.delete = on),
  },
  bot: {
    aliases: ["botaktif"],
    help: "Bot merespons di grup ini (khusus owner)",
    ownerOnly: true,
    get: (chat) => !chat.isBanned,
    set: (chat, on) => (chat.isBanned = !on),
  },
};

// ── fitur owner (config.features + database/settings.json) ────────────────
const OWNER_FEATURES = {
  selfmode: {
    aliases: ["self"],
    help: "Hanya owner yang bisa memakai bot",
    get: ({ db, config }) => db.settings.selfMode ?? config.features?.selfMode ?? false,
    set: ({ db }, on) => {
      db.settings.selfMode = on;
      db.save("settings");
    },
  },
  autoai: {
    aliases: ["ai"],
    help: "AutoAI Miyako membalas otomatis di chat pribadi",
    get: ({ db }) => Boolean(db.settings.autoAi),
    set: ({ db }, on) => {
      db.settings.autoAi = on;
      db.save("settings");
    },
  },
  anticall: {
    aliases: [],
    help: "Tolak panggilan masuk",
    key: "antiCall",
  },
  statusreact: {
    aliases: ["reactstatus"],
    help: "Lihat & beri reaksi otomatis ke status",
    key: "statusReact",
  },
  cmdsuggest: {
    aliases: ["suggest"],
    help: "Saran command bila salah ketik",
    key: "cmdSuggest",
  },
  levelup: {
    aliases: ["levelupnotif"],
    help: "Notifikasi naik level",
    key: "levelUpNotif",
  },
};

for (const feature of Object.values(OWNER_FEATURES)) {
  if (!feature.key) continue;
  const { key } = feature;
  feature.get = ({ config }) => (key === "levelUpNotif" ? config.features?.[key] !== false : Boolean(config.features?.[key]));
  feature.set = ({ db, config }, on) => {
    (config.features ??= {})[key] = on;
    (db.settings.features ??= {})[key] = on;
    db.save("settings");
  };
}

const find = (table, name) => {
  const key = String(name ?? "").toLowerCase();
  return Object.entries(table).find(([k, v]) => k === key || v.aliases.includes(key));
};

const mark = (on) => (on ? "✅" : "❌");

const listing = (env) => {
  const { ctx, chat, role } = env;
  const out = [];
  if (ctx.isGroup && chat) {
    out.push("👥 *group* (admin grup)");
    for (const [name, f] of Object.entries(GROUP_FEATURES)) {
      out.push(`${mark(f.get(chat))} ${name} — ${f.help}`);
    }
    out.push(`➡️ ${ctx.prefix}on <fitur> • ${ctx.prefix}off <fitur>`);
  }
  if (role.owner) {
    if (out.length) out.push("");
    out.push("👑 *owner* (khusus owner)");
    for (const [name, f] of Object.entries(OWNER_FEATURES)) {
      out.push(`${mark(f.get(env))} ${name} — ${f.help}`);
    }
    out.push(`➡️ ${ctx.prefix}on owner <fitur> • ${ctx.prefix}off owner <fitur>`);
  }
  if (!out.length) out.push("👥 Fitur grup hanya bisa diatur di dalam grup.");
  return out.join("\n");
};

const toggle = (on) => async (env) => {
  const { ctx, chat, role, db, group } = env;
  let args = [...ctx.args];
  const scope = ["owner", "group", "grup"].includes(args[0]?.toLowerCase()) ? args.shift().toLowerCase() : null;
  const name = args[0];

  if (!name) return ctx.reply(`⚙️ *Fitur ${on ? "ON" : "OFF"}*\n\n${listing(env)}`);

  // Fitur owner: eksplisit (`owner`), di chat pribadi, atau owner menyebut fitur bot di dalam grup
  const asOwner =
    scope === "owner" ||
    (!scope && !ctx.isGroup) ||
    (!scope && role.owner && !find(GROUP_FEATURES, name) && find(OWNER_FEATURES, name));
  if (asOwner) {
    if (!role.owner) return ctx.reply("❌ Fitur *owner* khusus Owner bot.");
    const hit = find(OWNER_FEATURES, name);
    if (!hit) return ctx.reply(`❌ Fitur *${name}* tidak ada.\n\n${listing(env)}`);
    const [label, feature] = hit;
    if (feature.get(env) === on) return ctx.reply(`ℹ️ *${label}* sudah ${on ? "aktif" : "mati"}.`);
    feature.set(env, on);
    return ctx.reply(`${mark(on)} *${label}* sekarang ${on ? "AKTIF" : "MATI"}.`);
  }

  // Fitur grup
  if (!ctx.isGroup) return ctx.reply("👥 Fitur grup hanya bisa diatur di dalam grup.\n💡 Fitur bot: *.on owner <fitur>*");
  const hit = find(GROUP_FEATURES, name);
  if (!hit) return ctx.reply(`❌ Fitur *${name}* tidak ada.\n\n${listing(env)}`);

  const [label, feature] = hit;
  const { isAdmin, isBotAdmin } = await group();
  if (feature.ownerOnly ? !role.owner : !isAdmin && !role.owner) {
    return ctx.reply(feature.ownerOnly ? "❌ Fitur ini khusus Owner bot." : "🛡️ Perintah ini khusus *admin grup*.");
  }
  if (feature.get(chat) === on) return ctx.reply(`ℹ️ *${label}* sudah ${on ? "aktif" : "mati"}.`);

  feature.set(chat, on);
  db.save("groups");

  const warn = on && feature.needsBotAdmin && !isBotAdmin ? "\n⚠️ Jadikan bot *admin grup* agar fitur ini berfungsi." : "";
  await ctx.reply(`${mark(on)} *${label}* sekarang ${on ? "AKTIF" : "MATI"}.${warn}`);
};

const on = definePlugin({
  name: "on",
  aliases: ["enable", "aktifkan"],
  category: "group",
  description: "Aktifkan fitur grup (on …) atau fitur bot (on owner …)",
  usage: "on <fitur> | on owner <fitur>",
  run: toggle(true),
});

const off = definePlugin({
  name: "off",
  aliases: ["disable", "matikan"],
  category: "group",
  description: "Matikan fitur grup (off …) atau fitur bot (off owner …)",
  usage: "off <fitur> | off owner <fitur>",
  run: toggle(false),
});

export default [on, off];
