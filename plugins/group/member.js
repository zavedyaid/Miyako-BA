import { definePlugin } from "#lib/plugins";
import { botIdentities, groups } from "#lib/groups";
import { PARTICIPANT_STATUS, findParticipant, identitiesOf, isOwnerParticipant, normalizeNumber, tag, targetsOf } from "#lib/targets";
import { toPn } from "#lib/utils";
import { t as tl } from "#lib/i18n";

/*
 * Kelola anggota: .add  .kick (.dor)  .promote  .demote
 * Target: @mention, reply pesan, atau nomor (62812… / 0812…).
 * Pembuat command harus admin grup (owner bot dikecualikan), bot harus admin.
 */

const isBot = (sock, participant) => {
  const mine = botIdentities(sock);
  return identitiesOf(participant).some((id) => mine.includes(id));
};

const statusOf = (entry) => String(entry?.status ?? "200");
const okStatus = (entry) => statusOf(entry) === "200";

// Jalankan aksi untuk daftar JID, lalu susun laporan "berhasil / gagal".
const apply = async ({ sock, ctx }, action, jids, skipped, doneText) => {
  const mentions = [...jids, ...skipped.map((s) => s.jid)];
  const lines = [];
  let done = 0;

  if (jids.length) {
    const result = await sock.groupParticipantsUpdate(ctx.chatId, jids, action);
    for (const [i, jid] of jids.entries()) {
      const entry = result?.find((r) => [r.jid, r.content?.attrs?.jid].includes(jid)) ?? result?.[i];
      if (okStatus(entry)) {
        done++;
        lines.push(`✅ ${tag(jid)} ${doneText}`);
      } else {
        lines.push(`❌ ${tag(jid)} — ${PARTICIPANT_STATUS[statusOf(entry)] ?? tl("ps.unknown", { code: statusOf(entry) })}`);
      }
    }
    groups.forget(ctx.chatId);
  }
  for (const { jid, reason } of skipped) lines.push(`⚠️ ${tag(jid)} — ${reason}`);

  await ctx.reply(lines.join("\n"), { mentions, quoted: false, preview: false });
  return done;
};

const usage = (ctx, name, extra = "") =>
  ctx.reply(tl("grp.member.1", { prefix: ctx.pfx, name, extra }));

const add = definePlugin({
  name: "add",
  aliases: ["tambah", "invite"],
  category: "group",
  description: "Tambah anggota lewat nomor / reply / mention",
  usage: "add <nomor>",
  access: { group: true, admin: true, botAdmin: true },
  async run(env) {
    const { ctx, group } = env;
    const targets = targetsOf(ctx).map((jid) => (jid.endsWith("@s.whatsapp.net") ? jid : null)).filter(Boolean);
    const numbers = ctx.args.map(normalizeNumber).filter(Boolean).map(toPn);
    const jids = [...new Set(targets.length ? targets : numbers)];
    if (!jids.length) return ctx.reply(tl("grp.member.2", { prefix: ctx.pfx }));
    if (jids.length > 10) return ctx.reply(tl("grp.member.3"));

    const { meta } = await group();
    const skipped = [];
    const todo = [];
    for (const jid of jids) {
      if (findParticipant(meta, jid)) skipped.push({ jid, reason: "sudah ada di grup" });
      else todo.push(jid);
    }
    await apply(env, "add", todo, skipped, "ditambahkan");
  },
});

const kick = definePlugin({
  name: "kick",
  aliases: ["dor", "remove", "tendang"],
  category: "group",
  description: "Keluarkan anggota dari grup",
  usage: "kick @user",
  access: { group: true, admin: true, botAdmin: true },
  async run(env) {
    const { sock, ctx, group, role } = env;
    const targets = targetsOf(ctx);
    if (!targets.length) return usage(ctx, "kick");

    const { meta } = await group();
    const skipped = [];
    const todo = [];

    for (const jid of targets) {
      const p = findParticipant(meta, jid);
      if (!p) skipped.push({ jid, reason: "bukan anggota grup" });
      else if (isBot(sock, p)) skipped.push({ jid, reason: "itu aku sendiri 🥲" });
      else if (isOwnerParticipant(p) && !role.owner) skipped.push({ jid, reason: "owner bot tidak bisa dikeluarkan" });
      else if (p.admin) skipped.push({ jid, reason: `admin grup — turunkan dulu dengan ${ctx.pfx}demote` });
      else todo.push(p.id);
    }
    await apply(env, "remove", todo, skipped, "dikeluarkan");
  },
});

const promote = definePlugin({
  name: "promote",
  aliases: ["admin", "jadiadmin"],
  category: "group",
  description: "Jadikan anggota sebagai admin",
  usage: "promote @user",
  access: { group: true, admin: true, botAdmin: true },
  async run(env) {
    const { ctx, group } = env;
    const targets = targetsOf(ctx);
    if (!targets.length) return usage(ctx, "promote");

    const { meta } = await group();
    const skipped = [];
    const todo = [];
    for (const jid of targets) {
      const p = findParticipant(meta, jid);
      if (!p) skipped.push({ jid, reason: "bukan anggota grup" });
      else if (p.admin) skipped.push({ jid, reason: "sudah admin" });
      else todo.push(p.id);
    }
    await apply(env, "promote", todo, skipped, "sekarang admin");
  },
});

const demote = definePlugin({
  name: "demote",
  aliases: ["unadmin", "turunadmin"],
  category: "group",
  description: "Turunkan admin jadi anggota biasa",
  usage: "demote @user",
  access: { group: true, admin: true, botAdmin: true },
  async run(env) {
    const { sock, ctx, group, role } = env;
    const targets = targetsOf(ctx);
    if (!targets.length) return usage(ctx, "demote");

    const { meta } = await group();
    const skipped = [];
    const todo = [];
    for (const jid of targets) {
      const p = findParticipant(meta, jid);
      if (!p) skipped.push({ jid, reason: "bukan anggota grup" });
      else if (p.admin === "superadmin") skipped.push({ jid, reason: "pembuat grup tidak bisa diturunkan" });
      else if (!p.admin) skipped.push({ jid, reason: "bukan admin" });
      else if (isBot(sock, p)) skipped.push({ jid, reason: "itu aku sendiri 🥲" });
      else if (isOwnerParticipant(p) && !role.owner) skipped.push({ jid, reason: "owner bot tidak bisa diturunkan" });
      else todo.push(p.id);
    }
    await apply(env, "demote", todo, skipped, "bukan admin lagi");
  },
});

export default [add, kick, promote, demote];
