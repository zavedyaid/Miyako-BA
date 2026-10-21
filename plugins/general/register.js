import { definePlugin } from "#lib/plugins";
import { t } from "#lib/i18n";
import { isRegistered, sendCard, startRegister, statusOf } from "#lib/register";
import { db } from "#lib/database";
import { registerAtm } from "#lib/atmflow";

/*
 * .register          → daftar (Nama → Umur → Gender) lalu dapat kartu register
 * .card [@tag]       → lihat kartu register sendiri / orang lain (alias .kartu)
 * .unreg ya          → hapus pendaftaran
 * Wajib terdaftar untuk memakai fitur bot (owner dikecualikan). Matikan: config.json → features.registerRequired
 */
const register = definePlugin({
  name: "register",
  aliases: ["daftar", "reg"],
  category: "general",
  description: "Register to use the bot (name, age, gender)",
  usage: "register",
  exp: 0,
  run: (env) => (/^atm$/i.test(env.ctx.args[0] ?? "") ? registerAtm(env) : startRegister(env)),
});

const kartu = definePlugin({
  name: "card",
  aliases: ["kartu", "mycard", "cekreg", "idcard"],
  category: "general",
  description: "View a registration card (yours, or the tagged / replied person)",
  usage: "card [@tag]",
  async run(env) {
    const { ctx, user, role, config } = env;
    const targetId = ctx.mentionedJid[0] ?? ctx.quotedSender ?? ctx.senderId;
    const self = targetId === ctx.senderId;
    const target = self ? user : db.users[targetId];

    if (!isRegistered(target)) {
      return ctx.reply(self ? t("reg.cardSelfNone", { p: ctx.pfx }) : t("reg.cardOtherNone"));
    }
    ctx.react("⏳");
    await sendCard(env, targetId, target, self ? statusOf(targetId, target, role) : statusOf(targetId, target, null));
    ctx.react("✅");
  },
});

const unregister = definePlugin({
  name: "unregister",
  aliases: ["unreg", "hapusakun"],
  category: "general",
  description: "Delete your registration",
  usage: "unreg yes",
  exp: 0,
  async run({ ctx, user }) {
    if (!isRegistered(user)) return ctx.reply(t("reg.unregNone"));
    if (!/^(ya|yes|y)$/i.test(ctx.args[0] ?? "")) {
      return ctx.reply(t("reg.unregConfirm", { name: user.reg.name, sn: user.reg.sn, p: ctx.pfx }));
    }
    user.reg = null;
    db.save("users");
    await ctx.reply(t("reg.unregDone", { p: ctx.pfx }));
  },
});

export default [register, kartu, unregister];
