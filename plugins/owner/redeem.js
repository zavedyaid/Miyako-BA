import { definePlugin } from "#lib/plugins";
import { codeSummary, createCode, deleteCode, describe, isEmpty, parseSpec } from "#lib/redeem";
import { db } from "#lib/database";
import { tr } from "#lib/tr";

/*
 * Kelola kode hadiah (khusus owner). Pemain menukarnya dengan `.redeem <kode>`.
 *   .createredeem [KODE] gold=5000 diamond=10 limit=50 premium=7d xp=500 exp=300 level=1 item=petiemas:2 max=100 ttl=7d note=teks
 *     • tanpa KODE → dibuat acak (MIYAKO-XXXXXXXX)
 *     • gold, diamond, limit, premium (hari/perm), exp (EXP bot), xp (XP RPG), level (+level bot), item=<id>:<jumlah> (atau langsung <id>=<jumlah>)
 *     • max = kuota pemakai (0 = tak terbatas) · ttl = masa berlaku (30m, 12h, 7d, 2w; kosong = selamanya)
 *   .delredeem <KODE> · .listredeem · .listredeem <KODE>
 */
const create = definePlugin({
  name: "createredeem",
  aliases: ["buatredeem", "newredeem", "addredeem"],
  category: "owner",
  access: { owner: true },
  description: "Create an admin redeem code: premium, limit, gold, diamond, XP, items…",
  usage: "createredeem [KODE] gold=5000 limit=50 premium=7d item=petiemas:2 max=100 ttl=7d",
  async run({ ctx }) {
    const p = ctx.pfx;
    const help = tr(
      `🎁 *CREATE REDEEM*\n*${p}createredeem [KODE] <hadiah…> [max=N] [ttl=7d] [note=teks]*\n\nHadiah: gold · diamond · limit · premium=7d|perm · exp (EXP bot) · xp (XP RPG) · level (+level bot) · item=<id>:<jumlah>\n\nContoh:\n*${p}createredeem gold=5000 diamond=10 limit=50 max=100 ttl=7d*\n*${p}createredeem VIP7 premium=7d item=petiemas:2 max=20 note=Event VIP*`,
      `🎁 *CREATE REDEEM*\n*${p}createredeem [CODE] <rewards…> [max=N] [ttl=7d] [note=text]*\n\nRewards: gold · diamond · limit · premium=7d|perm · exp (bot EXP) · xp (RPG XP) · level (+bot levels) · item=<id>:<amount>\n\nExamples:\n*${p}createredeem gold=5000 diamond=10 limit=50 max=100 ttl=7d*\n*${p}createredeem VIP7 premium=7d item=petiemas:2 max=20 note=VIP event*`,
    );
    if (!ctx.args.length) return ctx.reply(help);
    const spec = parseSpec(ctx.args);
    if (spec.errors.length) return ctx.reply(tr(`❌ Tidak dikenali: ${spec.errors.join(", ")}\n\n${help}`, `❌ Unrecognized: ${spec.errors.join(", ")}\n\n${help}`));
    if (isEmpty(spec.rewards)) return ctx.reply(tr("❌ Belum ada hadiah.\n\n", "❌ No rewards given.\n\n") + help);
    let entry;
    try {
      entry = createCode({ ...spec, by: ctx.senderId });
    } catch (err) {
      return ctx.reply(`❌ ${err.message}`);
    }
    await ctx.reply([tr("✅ *Kode redeem dibuat*", "✅ *Redeem code created*"), "", codeSummary(entry), "", tr(`Bagikan: *${p}redeem ${entry.code}*`, `Share: *${p}redeem ${entry.code}*`)].join("\n"), { preview: false });
  },
});

const del = definePlugin({
  name: "delredeem",
  aliases: ["hapusredeem", "rmredeem"],
  category: "owner",
  access: { owner: true },
  description: "Delete a redeem code",
  usage: "delredeem <KODE>",
  async run({ ctx }) {
    const code = ctx.args[0];
    if (!code) return ctx.reply(tr(`Format: *${ctx.pfx}delredeem <KODE>*`, `Usage: *${ctx.pfx}delredeem <CODE>*`));
    await ctx.reply(deleteCode(code) ? tr(`🗑️ Kode *${code.toUpperCase()}* dihapus.`, `🗑️ Code *${code.toUpperCase()}* deleted.`) : tr("❌ Kode tidak ditemukan.", "❌ Code not found."));
  },
});

const list = definePlugin({
  name: "listredeem",
  aliases: ["redeemlist", "kodelist", "inforedeem"],
  category: "owner",
  access: { owner: true },
  description: "List redeem codes (or details of one code)",
  usage: "listredeem [KODE]",
  async run({ ctx }) {
    const one = ctx.args[0] && db.redeem[ctx.args[0].toUpperCase()];
    if (ctx.args[0] && !one) return ctx.reply(tr("❌ Kode tidak ditemukan.", "❌ Code not found."));
    if (one) return ctx.reply([codeSummary(one), "", tr(`Dipakai oleh: ${Object.keys(one.usedBy).map((j) => `@${j.split("@")[0]}`).join(", ") || "-"}`, `Used by: ${Object.keys(one.usedBy).map((j) => `@${j.split("@")[0]}`).join(", ") || "-"}`)].join("\n"), { mentions: Object.keys(one.usedBy), preview: false });
    const all = Object.values(db.redeem);
    if (!all.length) return ctx.reply(tr(`Belum ada kode. Buat dengan *${ctx.pfx}createredeem*.`, `No codes yet. Create one with *${ctx.pfx}createredeem*.`));
    await ctx.reply([tr(`🎁 *Kode redeem* (${all.length})`, `🎁 *Redeem codes* (${all.length})`), "", ...all.slice(-20).map((e) => `• *${e.code}* — ${describe(e.rewards).join(", ")} · ${e.uses}/${e.max || "∞"}${e.expiresAt && Date.now() > e.expiresAt ? " ⌛" : ""}`)].join("\n"), { preview: false });
  },
});

export default [create, del, list];
