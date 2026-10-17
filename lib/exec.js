import { authorize } from "#lib/access";
import { config } from "#lib/config";
import { db } from "#lib/database";
import { groups } from "#lib/groups";
import { announceLevelUp } from "#lib/levelup";
import { logger } from "#lib/logger";
import { gainExp } from "#lib/utils";

/*
 * Satu pintu untuk menjalankan command (dipakai handler dan AutoAI):
 * akses → limit (dipotong di muka, dikembalikan bila gagal) → statistik & EXP → jalankan → pesan limit → naik level.
 */
const LOW = 3;

// Pesan setelah limit terpakai. Matikan dengan  .off owner limitnotice
export const limitNotice = ({ cost, left }) => {
  const total = config.limit?.default;
  const lines = [`🎟️ Limit terpakai *${cost}* • sisa *${left}*${total ? `/${total}` : ""}`];
  if (left <= 0) lines.push("⚠️ Limit habis — reset otomatis besok.");
  else if (left <= LOW) lines.push("⚠️ Limit hampir habis.");
  return lines.join("\n");
};

export const executeCommand = async (plugin, env, { announce = true } = {}) => {
  const { ctx, role, user } = env;

  const denied = await authorize(plugin, env);
  if (denied) {
    await ctx.reply(denied);
    return { ran: false, denied: true };
  }

  const cost = plugin.limit ?? 0;
  const charged = cost > 0 && !role.premium;
  if (charged) {
    if (user.limit < cost) {
      await ctx.reply(`❌ Limit harian habis!\n📊 Punya: ${user.limit} | Butuh: ${cost}`);
      return { ran: false, noLimit: true };
    }
    user.limit -= cost;
  }

  db.stats[plugin.name] = (db.stats[plugin.name] ?? 0) + 1;
  const levelBefore = user.level;
  gainExp(user, plugin.exp);
  db.save("users", "stats");

  logger.cmd({
    command: `${ctx.prefix}${ctx.command}`,
    name: ctx.pushName,
    number: ctx.senderNumber,
    where: ctx.isGroup ? (groups.peek(ctx.chatId)?.subject ?? "grup") : null,
  });
  ctx.typing?.();

  let failed = false;
  try {
    await plugin.run(env);
  } catch (err) {
    failed = true;
    if (charged) {
      user.limit += cost;
      db.save("users");
    }
    logger.error(`[${plugin.name}] ${err.stack ?? err.message}`);
    await ctx.reply(`❌ Terjadi kesalahan: ${err.message}`);
  }

  // Limit terpakai & tidak gagal → kabari sisa limitnya.
  if (!failed && charged && config.features?.limitNotice !== false) {
    await ctx.reply(limitNotice({ cost, left: user.limit }), { quoted: false, preview: false }).catch(() => {});
  }

  // Setelah balasan command terkirim, baru umumkan kalau naik level.
  if (announce) await announceLevelUp(env, levelBefore);
  return { ran: true, failed };
};
