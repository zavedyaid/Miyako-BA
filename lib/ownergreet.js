import { config } from "#lib/config";
import { t } from "#lib/i18n";
import { greeting, numberOf, randomInt, sleep } from "#lib/utils";

/*
 * Bot menyapa saat OWNER chat di grup.
 *   Saklar global : config.json → features.ownerGreet (true/false)
 *   Saklar grup   : .on ownergreet / .off ownergreet  (admin grup)
 *   Jeda          : config.json → ownerGreet.cooldownMinutes (bawaan 30; 0 = sapa setiap pesan owner)
 */
const LINES = 6; // teks di config/lang: og.0 … og.5  ({g} salam, {n} nomor)

const lastGreet = new Map(); // "chat|owner" → ms

export const greetOwner = async (env) => {
  const { ctx, role, chat } = env;
  if (!ctx.isGroup || !role.owner || ctx.fromMe || ctx.isStatus) return;
  if (config.features?.ownerGreet === false || chat?.ownerGreet === false) return;

  const key = `${ctx.chatId}|${ctx.senderId}`;
  const cooldown = (config.ownerGreet?.cooldownMinutes ?? 30) * 60_000;
  if (cooldown > 0 && Date.now() - (lastGreet.get(key) ?? 0) < cooldown) return;
  lastGreet.set(key, Date.now());

  if (ctx.isCmd) await sleep(1500); // biar balasan command-nya tampil duluan
  const text = t(`og.${randomInt(0, LINES - 1)}`, { n: numberOf(ctx.senderId), g: greeting(config.timezone) });
  await ctx.reply(text, { quoted: true, mentions: [ctx.senderId] });
};
