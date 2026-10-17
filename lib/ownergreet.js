import { config } from "#lib/config";
import { greeting, numberOf, pick, sleep } from "#lib/utils";

/*
 * Bot menyapa saat OWNER chat di grup.
 *   Saklar global : config.json → features.ownerGreet (true/false)
 *   Saklar grup   : .on ownergreet / .off ownergreet  (admin grup)
 *   Jeda          : config.json → ownerGreet.cooldownMinutes (bawaan 30; 0 = sapa setiap pesan owner)
 */
const LINES = [
  (n, g) => `Eh, ada owner ku nih~ 👑\n${g}, @${n}! Owner ku yang ganteng nan baik hati ✨`,
  (n, g) => `Waaah, owner ku yang ganteng nan baik hati muncul! 🥰\n${g}, @${n}~`,
  (n, g) => `Perhatian semuanya, ada owner ku di sini! 👑\n${g} @${n}, semoga harimu menyenangkan ya ✨`,
  (n, g) => `Hai @${n}! ${g} 🌟\nOwner ku yang paling ganteng dan baik hati akhirnya chat juga~`,
  (n, g) => `Ohh, ada @${n}! 😍\n${g}, owner ku tersayang. Ganteng, baik hati, dan selalu bikin bot ini bangga!`,
  (n, g) => `Siap-siap, ada owner ku datang! 🫡\n${g} @${n}, owner ku yang ganteng nan baik hati~`,
];

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
  const text = pick(LINES)(numberOf(ctx.senderId), greeting(config.timezone));
  await ctx.reply(text, { quoted: true, mentions: [ctx.senderId] });
};
