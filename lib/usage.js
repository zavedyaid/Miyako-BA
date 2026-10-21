import { t } from "#lib/i18n";

/*
 * Bantuan otomatis untuk SEMUA command.
 *  • `.<cmd> help` / `.<cmd> ?` / `.<cmd> bantuan` → kartu cara pakai.
 *  • Command yang WAJIB berargumen (usage diawali <…> atau @tag) dipanggil kosong
 *    (tanpa teks, reply, media, maupun tag) → kartu cara pakai, limit TIDAK terpotong.
 * Opt-out: `ownHelp: true` di definePlugin (untuk plugin yang sudah punya bantuan sendiri, mis. chess).
 */
const HELP_WORD = /^(help|\?|bantuan)$/i;

export const usageCard = (plugin, pfx = ".") => {
  const lines = [`📖 *${pfx}${plugin.name}*`];
  if (plugin.description) lines.push(plugin.description);
  lines.push("", `› *${pfx}${plugin.usage || plugin.name}*`);
  if (plugin.aliases?.length) lines.push("", `🔁 ${t("usage.alias")}: ${plugin.aliases.map((a) => pfx + a).join(", ")}`);
  return lines.join("\n");
};

// Argumen pertama setelah nama command bersifat wajib?  "deposit <jumlah|all>" ✓ · "give @tag …" ✓ · "menu [kategori]" ✗
const requiresArgs = (plugin) => {
  const rest = String(plugin.usage ?? "").trim().split(/\s+/).slice(1)[0] ?? "";
  return rest.startsWith("<") || rest.startsWith("@");
};

export const usageNeeded = (plugin, ctx) => {
  if (plugin.ownHelp) return false;
  if (ctx.args.length === 1 && HELP_WORD.test(ctx.args[0]) && !/help/i.test(plugin.usage ?? "")) return true;
  return requiresArgs(plugin) && !ctx.args.length && !ctx.isQuoted && !ctx.hasMedia && !(ctx.mentionedJid?.length);
};
