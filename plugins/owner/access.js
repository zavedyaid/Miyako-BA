import { definePlugin } from "#lib/plugins";
import { config, isOwnerIdentity } from "#lib/config";
import { parseDays, tag, targetsOf } from "#lib/targets";
import { formatNumber, numberOf } from "#lib/utils";
import { t as tl } from "#lib/i18n";

/*
 * Kelola hak akses (khusus owner):
 *   .addowner / .delowner / .listowner
 *   .addprem <target> [hari|perm] / .delprem / .listprem
 *   .ban / .unban <target>
 * Target: @mention, reply pesan, atau nomor (62812… / 0812…).
 */
const DAY = 86_400_000;
const digits = (jid) => numberOf(jid).replace(/\D/g, "");
const isConfigOwner = (jid) => isOwnerIdentity({ pn: jid, lid: jid });

const needTarget = (ctx, name, extra = "") =>
  ctx.reply(tl("own.access.1", { prefix: ctx.pfx, name, extra }));

const addowner = definePlugin({
  name: "addowner",
  aliases: ["addown"],
  category: "owner",
  description: "Tambah owner bot (selain yang ada di config.json)",
  usage: "addowner @user | reply | nomor",
  access: { owner: true },
  async run({ ctx, db }) {
    const targets = targetsOf(ctx);
    if (!targets.length) return needTarget(ctx, "addowner");

    db.settings.owners ??= [];
    const lines = [];
    for (const jid of targets) {
      const id = digits(jid);
      if (isConfigOwner(jid) || db.settings.owners.includes(id)) lines.push(`ℹ️ ${tag(jid)} sudah jadi owner`);
      else {
        db.settings.owners.push(id);
        lines.push(`✅ ${tag(jid)} sekarang *Owner*`);
      }
    }
    db.save("settings");
    await ctx.reply(lines.join("\n"), { mentions: targets, preview: false });
  },
});

const delowner = definePlugin({
  name: "delowner",
  aliases: ["delown", "rmowner"],
  category: "owner",
  description: "Hapus owner tambahan",
  usage: "delowner @user | reply | nomor",
  access: { owner: true },
  async run({ ctx, db }) {
    const targets = targetsOf(ctx);
    if (!targets.length) return needTarget(ctx, "delowner");

    const lines = [];
    for (const jid of targets) {
      const id = digits(jid);
      const at = (db.settings.owners ?? []).indexOf(id);
      if (isConfigOwner(jid)) lines.push(`🔒 ${tag(jid)} owner utama (config.json) — hapus lewat file, bukan bot`);
      else if (at < 0) lines.push(`ℹ️ ${tag(jid)} bukan owner tambahan`);
      else {
        db.settings.owners.splice(at, 1);
        lines.push(`🗑️ ${tag(jid)} bukan owner lagi`);
      }
    }
    db.save("settings");
    await ctx.reply(lines.join("\n"), { mentions: targets, preview: false });
  },
});

const listowner = definePlugin({
  name: "listowner",
  aliases: ["owners"],
  category: "owner",
  description: "Daftar owner bot",
  access: { owner: true },
  async run({ ctx, db }) {
    const main = [...config.owners];
    const extra = db.settings.owners ?? [];
    const mentions = [...main, ...extra].map((n) => `${n}@s.whatsapp.net`);
    const lines = [
      `👑 *Owner utama* (config.json) — ${main.length}`,
      ...main.map((n, i) => `${i + 1}. @${n}`),
      "",
      `➕ *Owner tambahan* — ${extra.length}`,
      ...(extra.length ? extra.map((n, i) => `${i + 1}. @${n}`) : ["(kosong)"]),
    ];
    await ctx.reply(lines.join("\n"), { mentions, preview: false });
  },
});

const addprem = definePlugin({
  name: "addprem",
  aliases: ["addpremium"],
  category: "owner",
  description: "Beri akses premium (default 30 hari, perm = permanen)",
  usage: "addprem @user [hari|perm]",
  access: { owner: true },
  async run({ ctx, db }) {
    const targets = targetsOf(ctx);
    if (!targets.length) return needTarget(ctx, "addprem", " 30");

    const days = parseDays(ctx.args.at(-1)) ?? 30;
    const lines = [];
    for (const jid of targets) {
      const user = db.user(jid);
      const base = user.premium?.on && user.premium.expiredAt > Date.now() ? user.premium.expiredAt : Date.now();
      user.premium = { on: true, expiredAt: days === 0 ? 0 : base + days * DAY };
      lines.push(`💎 ${tag(jid)} premium ${days === 0 ? "*permanen*" : `+${formatNumber(days)} hari (sampai ${new Date(user.premium.expiredAt).toLocaleDateString("id-ID", { dateStyle: "medium" })})`}`);
    }
    db.save("users");
    await ctx.reply(lines.join("\n"), { mentions: targets, preview: false });
  },
});

const delprem = definePlugin({
  name: "delprem",
  aliases: ["delpremium", "rmprem"],
  category: "owner",
  description: "Cabut akses premium",
  usage: "delprem @user | reply | nomor",
  access: { owner: true },
  async run({ ctx, db }) {
    const targets = targetsOf(ctx);
    if (!targets.length) return needTarget(ctx, "delprem");

    const lines = [];
    for (const jid of targets) {
      const user = db.users[jid];
      if (!user?.premium?.on) lines.push(`ℹ️ ${tag(jid)} bukan premium`);
      else {
        user.premium = { on: false, expiredAt: 0 };
        lines.push(`🗑️ Premium ${tag(jid)} dicabut`);
      }
    }
    db.save("users");
    await ctx.reply(lines.join("\n"), { mentions: targets, preview: false });
  },
});

const listprem = definePlugin({
  name: "listprem",
  aliases: ["premlist", "premiums"],
  category: "owner",
  description: "Daftar pengguna premium",
  access: { owner: true },
  async run({ ctx, db }) {
    const active = Object.entries(db.users).filter(([, u]) => u.premium?.on && (!u.premium.expiredAt || u.premium.expiredAt > Date.now()));
    if (!active.length) return ctx.reply(tl("own.access.2"));

    const lines = active.map(([jid, u], i) => {
      const left = u.premium.expiredAt ? `${Math.ceil((u.premium.expiredAt - Date.now()) / DAY)} hari lagi` : "permanen";
      return `${i + 1}. @${numberOf(jid)} — ${left}`;
    });
    await ctx.reply(`💎 *Premium* (${active.length})\n\n${lines.join("\n")}`, { mentions: active.map(([jid]) => jid), preview: false });
  },
});

const ban = definePlugin({
  name: "ban",
  aliases: ["banuser"],
  category: "owner",
  description: "Blokir pengguna dari bot",
  usage: "ban @user | reply | nomor",
  access: { owner: true },
  async run({ ctx, db }) {
    const targets = targetsOf(ctx);
    if (!targets.length) return needTarget(ctx, "ban");

    const lines = [];
    for (const jid of targets) {
      if (isConfigOwner(jid) || db.isExtraOwner({ pn: jid, lid: jid })) lines.push(`🔒 ${tag(jid)} owner tidak bisa diblokir`);
      else {
        db.user(jid).banned = true;
        lines.push(`🚫 ${tag(jid)} diblokir`);
      }
    }
    db.save("users");
    await ctx.reply(lines.join("\n"), { mentions: targets, preview: false });
  },
});

const unban = definePlugin({
  name: "unban",
  aliases: ["unbanuser"],
  category: "owner",
  description: "Buka blokir pengguna",
  usage: "unban @user | reply | nomor",
  access: { owner: true },
  async run({ ctx, db }) {
    const targets = targetsOf(ctx);
    if (!targets.length) return needTarget(ctx, "unban");

    const lines = [];
    for (const jid of targets) {
      const user = db.users[jid];
      if (!user?.banned) lines.push(`ℹ️ ${tag(jid)} tidak diblokir`);
      else {
        user.banned = false;
        lines.push(`✅ ${tag(jid)} dibuka blokirnya`);
      }
    }
    db.save("users");
    await ctx.reply(lines.join("\n"), { mentions: targets, preview: false });
  },
});

export default [addowner, delowner, listowner, addprem, delprem, listprem, ban, unban];
