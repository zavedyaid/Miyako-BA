import { definePlugin } from "#lib/plugins";
import { getRpg } from "#lib/rpg";
import { sendHero, sendInventory } from "#lib/rpgui";
import { db } from "#lib/database";
import { t } from "#lib/i18n";

const inv = definePlugin({
  name: "inventory",
  aliases: ["inv", "tas", "bag"],
  category: "rpg",
  access: { group: true },
  description: "View your RPG bag (card)",
  usage: "inv [halaman]",
  async run(env) {
    const { ctx, user, db: store } = env;
    const r = getRpg(user);
    await sendInventory(env, r, Number(ctx.args[0]) || 1);
    store.save("users");
  },
});

const hero = definePlugin({
  name: "rpg",
  aliases: ["hero", "petualang"],
  category: "rpg",
  access: { group: true },
  description: "Your adventurer status card (or the tagged player). `.rpg help` = game guide",
  usage: "rpg [@tag | help]",
  async run(env) {
    const { ctx, user } = env;
    if (/^(help|bantuan|panduan)$/i.test(ctx.args[0] ?? "")) {
      return ctx.reply(t("rpg.help", { p: ctx.pfx }));
    }
    const targetId = ctx.mentionedJid[0] ?? ctx.quotedSender ?? ctx.senderId;
    const self = targetId === ctx.senderId;
    const target = self ? user : db.users[targetId];
    if (!target?.rpg && !self) return ctx.reply(t("rpg.noRpg"));
    const r = getRpg(target);
    await sendHero(env, r, targetId, self ? undefined : target.reg?.name ?? target.name ?? undefined);
    db.save("users");
  },
});

export default [inv, hero];
