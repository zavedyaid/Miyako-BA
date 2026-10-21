import { definePlugin } from "#lib/plugins";
import fs from "node:fs";
import path from "node:path";
import { BACKUP_DIR, backupSettings, createBackup, findBackup, listBackups, refreshAutoBackup, restoreBackup } from "#lib/backup";
import { config } from "#lib/config";
import { db } from "#lib/database";
import { localeOf, t } from "#lib/i18n";

/*
 * Owner only.  .backup [full | list | get <no> | auto on|off [jam]]   ·   .restore <no|nama|latest> yes   (atau reply ke .zip backup)
 * Backup dikirim ke chat PRIBADI owner (isinya database — jangan dikirim ke grup).
 */
const kb = (n) => (n / 1024).toFixed(1);
const when = (ms) => new Intl.DateTimeFormat(localeOf(), { timeZone: config.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));

const sendZip = async ({ sock, ctx }, file, name, caption) => {
  const dest = ctx.isGroup ? ctx.senderPn ?? ctx.senderId : ctx.chatId;
  await sock.sendMessage(dest, { document: fs.readFileSync(file), mimetype: "application/zip", fileName: name, caption });
  if (ctx.isGroup) await ctx.reply(t("bk.sentPrivate"));
};

const backup = definePlugin({
  name: "backup",
  aliases: ["bk", "cadangan"],
  category: "owner",
  access: { owner: true },
  description: "Create / list / schedule database backups",
  usage: "backup [full|list|get <no>|auto on|off [hours]]",
  async run(env) {
    const { ctx } = env, p = ctx.pfx, sub = (ctx.args[0] ?? "").toLowerCase();

    if (sub === "help") return ctx.reply(t("bk.help", { p }));

    if (sub === "list") {
      const all = listBackups();
      if (!all.length) return ctx.reply(t("bk.empty", { p }));
      return ctx.reply([t("bk.listHead", { n: all.length }), ...all.slice(0, 15).map((b, i) => `${i + 1}. ${b.name} — ${kb(b.size)} KB · ${when(b.at)}`), "", t("bk.help", { p }).split("\n").slice(3, 4).join("")].join("\n"));
    }

    if (sub === "get") {
      const found = findBackup(ctx.args[1]);
      if (!found) return ctx.reply(t("bk.notFound", { p }));
      return sendZip(env, path.join(BACKUP_DIR, found.name), found.name, `💾 ${found.name}`);
    }

    if (sub === "auto") {
      const mode = (ctx.args[1] ?? "").toLowerCase();
      const hours = Number(ctx.args[2]);
      db.settings.backup ??= {};
      if (mode === "on" || mode === "off") {
        db.settings.backup.auto = mode === "on";
        if (Number.isFinite(hours) && hours > 0) db.settings.backup.hours = hours;
        db.save("settings");
        refreshAutoBackup();
        const cur = backupSettings();
        return ctx.reply(mode === "on" ? t("bk.autoOn", { hours: cur.hours }) : t("bk.autoOff"));
      }
      const cur = backupSettings();
      return ctx.reply(t("bk.autoShow", { state: cur.auto ? t("bk.on") : t("bk.off"), hours: cur.hours, keep: db.settings.backup?.keep ?? config.backup?.keep ?? 10, send: cur.sendToOwner ? t("bk.yes") : t("bk.no") }));
    }

    try {
      const full = sub === "full";
      const result = createBackup({ full });
      await sendZip(env, result.file, result.name, `${t("bk.created", { name: result.name, size: kb(result.size), files: result.files })}${full ? `\n${t("bk.full")}` : ""}`);
    } catch (err) {
      await ctx.reply(t("bk.failed", { err: err.message }));
    }
  },
});

const restore = definePlugin({
  name: "restore",
  aliases: ["pulihkan"],
  category: "owner",
  access: { owner: true },
  description: "Restore the database from a backup (local backup or replied .zip)",
  usage: "restore <no|name|latest> yes",
  async run({ ctx }) {
    const p = ctx.pfx;
    const confirmed = /^(yes|y|ya)$/i.test(ctx.args.at(-1) ?? "");
    const ref = ctx.args.filter((a) => !/^(yes|y|ya)$/i.test(a))[0];

    // 1) berkas .zip yang di-reply   2) backup lokal
    let buffer = null, label = null;
    if (!ref && ctx.hasMedia) {
      const media = await ctx.fetchMedia().catch(() => null);
      if (media?.kind === "document" && media.buffer.subarray(0, 2).toString() === "PK") { buffer = media.buffer; label = "replied file"; }
    }
    if (!buffer) {
      const found = findBackup(ref);
      if (!found) return ctx.reply(ref || !ctx.hasMedia ? t("bk.notFound", { p }) : t("bk.help", { p }));
      if (!confirmed) return ctx.reply(t("bk.restoreConfirm", { name: found.name, ref: ref ?? "latest", p }));
      buffer = fs.readFileSync(path.join(BACKUP_DIR, found.name));
      label = found.name;
    } else if (!confirmed) {
      return ctx.reply(t("bk.restoreFromReply", { p }));
    }

    try {
      const r = restoreBackup(buffer);
      await ctx.reply([t("bk.restored", { n: r.restored, safety: r.safety }), ...(r.needsRestart ? [t("bk.restart")] : [])].join("\n"));
    } catch (err) {
      await ctx.reply(t("bk.restoreFail", { err: err.message }));
    }
  },
});

export default [backup, restore];
