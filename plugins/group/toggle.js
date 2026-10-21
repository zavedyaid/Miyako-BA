import { lex } from "#lib/i18n";
import { definePlugin } from "#lib/plugins";
import { t as tl } from "#lib/i18n";

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
  ownergreet: {
    aliases: ["sapaowner", "sapaanowner"],
    help: "Bot menyapa saat owner chat di grup ini",
    get: (chat) => chat.ownerGreet !== false,
    set: (chat, on) => (chat.ownerGreet = on),
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
  antispam: {
    aliases: ["anti-spam", "spam"],
    help: "Hapus pesan banjir (spam) otomatis & keluarkan setelah 3x peringatan (bot harus admin)",
    needsBotAdmin: true,
    get: (chat) => chat.antiSpam,
    set: (chat, on) => (chat.antiSpam = on),
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
  autoread: {
    aliases: ["read", "autobaca"],
    help: "Tandai pesan masuk sudah dibaca (grup & pribadi). Atur cakupan: .set owner autoread <all|group|private>",
    get: ({ config }) => Boolean(config.features?.autoRead),
    set: ({ db, config }, on) => {
      const value = on ? (config.features?.autoRead || "all") : false;
      (config.features ??= {}).autoRead = value;
      (db.settings.features ??= {}).autoRead = value;
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
  limitnotice: {
    aliases: ["limitinfo", "pesanlimit"],
    help: "Kabari sisa limit setiap kali limit terpakai",
    key: "limitNotice",
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
  feature.get = ({ config }) => (["levelUpNotif", "limitNotice"].includes(key) ? config.features?.[key] !== false : Boolean(config.features?.[key]));
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
    out.push(tl("tg4.1"));
    for (const [name, f] of Object.entries(GROUP_FEATURES)) {
      out.push(`${mark(f.get(chat))} ${name} — ${lex(f.help)}`);
    }
    out.push(tl("tg4.2", { pfx: ctx.pfx, pfx1: ctx.pfx }));
  }
  if (role.owner) {
    if (out.length) out.push("");
    out.push(tl("tg4.3"));
    for (const [name, f] of Object.entries(OWNER_FEATURES)) {
      out.push(`${mark(f.get(env))} ${name} — ${lex(f.help)}`);
    }
    out.push(tl("tg4.4", { pfx: ctx.pfx, pfx1: ctx.pfx }));
  }
  if (!out.length) out.push(tl("tg3.1"));
  return out.join("\n");
};

const toggle = (on) => async (env) => {
  const { ctx, chat, role, db, group } = env;
  let args = [...ctx.args];
  const scope = ["owner", "group", "grup"].includes(args[0]?.toLowerCase()) ? args.shift().toLowerCase() : null;
  const name = args[0];

  if (!name) return ctx.reply(tl("tg3.2", { v: on ? "ON" : "OFF", v1: listing(env) }));

  // Fitur owner: eksplisit (`owner`), di chat pribadi, atau owner menyebut fitur bot di dalam grup
  const asOwner =
    scope === "owner" ||
    (!scope && !ctx.isGroup) ||
    (!scope && role.owner && !find(GROUP_FEATURES, name) && find(OWNER_FEATURES, name));
  if (asOwner) {
    if (!role.owner) return ctx.reply(tl("tg3.3"));
    const hit = find(OWNER_FEATURES, name);
    if (!hit) return ctx.reply(tl("grp.toggle.1", { name, v: listing(env) }));
    const [label, feature] = hit;
    if (feature.get(env) === on) return ctx.reply(tl("grp.toggle.4", { label, v: on ? tl("grp.toggle.2") : tl("grp.toggle.3") }));
    feature.set(env, on);
    return ctx.reply(tl("grp2.toggle.1", { v: mark(on), label, v1: on ? tl("grp.toggle.5") : tl("grp.toggle.6") }));
  }

  // Fitur grup
  if (!ctx.isGroup) return ctx.reply(tl("grp.toggle.7"));
  const hit = find(GROUP_FEATURES, name);
  if (!hit) return ctx.reply(tl("grp.toggle.8", { name, v: listing(env) }));

  const [label, feature] = hit;
  const { isAdmin, isBotAdmin } = await group();
  if (feature.ownerOnly ? !role.owner : !isAdmin && !role.owner) {
    return ctx.reply(feature.ownerOnly ? tl("grp.toggle.9") : tl("grp.toggle.10"));
  }
  if (feature.get(chat) === on) return ctx.reply(tl("grp.toggle.13", { label, v: on ? tl("grp.toggle.11") : tl("grp.toggle.12") }));

  feature.set(chat, on);
  db.save("groups");

  const warn = on && feature.needsBotAdmin && !isBotAdmin ? tl("tg4.5") : "";
  await ctx.reply(tl("grp2.toggle.2", { v: mark(on), label, v1: on ? tl("grp.toggle.14") : tl("grp.toggle.15"), warn }));
};

const on = definePlugin({
  name: "on",
  ownHelp: true,
  aliases: ["enable", "aktifkan"],
  category: "group",
  description: "Aktifkan fitur grup (on …) atau fitur bot (on owner …)",
  usage: "on <fitur> | on owner <fitur>",
  run: toggle(true),
});

const off = definePlugin({
  name: "off",
  ownHelp: true,
  aliases: ["disable", "matikan"],
  category: "group",
  description: "Matikan fitur grup (off …) atau fitur bot (off owner …)",
  usage: "off <fitur> | off owner <fitur>",
  run: toggle(false),
});

export default [on, off];
