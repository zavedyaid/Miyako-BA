import { definePlugin } from "#lib/plugins";
import { db } from "#lib/database";
import { LANGS, defaultLang, t, translate } from "#lib/i18n";

/*
 * .lang                 → bahasa saat ini + daftar bahasa
 * .lang <kode>          → di GRUP: bahasa grup (admin grup / owner) · di chat pribadi: bahasamu
 * .lang reset           → hapus pengaturan (ikut bawaan)
 * .lang default <kode>  → bahasa bawaan bot (owner)
 * Urutan: grup → pengguna → bawaan bot → config.language → English.   Kode: en, id
 */
export default definePlugin({
  name: "lang",
  aliases: ["language", "setlang", "bahasa"],
  category: "general",
  description: "Change the bot language (English / Bahasa Indonesia)",
  usage: "lang [en|id|reset]  ·  lang default <en|id> (owner)",
  async run(env) {
    const { ctx, user, chat, role } = env, p = ctx.pfx;
    const list = Object.entries(LANGS).map(([code, name]) => `*${code}* (${name})`).join(", ");
    const arg = (ctx.args[0] ?? "").toLowerCase();
    const current = chat?.lang ?? user.lang ?? defaultLang();
    if (!arg) return ctx.reply(t("lang.show", { lang: `${current} — ${LANGS[current]}`, list, p }));

    // Balasan konfirmasi memakai bahasa BARU.
    const done = (lang, key, extra = {}) => ctx.reply(translate(lang, key, { lang: `${lang} — ${LANGS[lang]}`, ...extra }));

    if (arg === "default") {
      if (!role.owner) return ctx.reply(t("denied.owner"));
      const code = (ctx.args[1] ?? "").toLowerCase();
      if (!LANGS[code]) return ctx.reply(t("lang.invalid", { list }));
      db.settings.lang = code;
      db.save("settings");
      return done(code, "lang.setDefault");
    }

    const scope = ctx.isGroup ? chat : user;
    if (ctx.isGroup && !role.owner && !(await env.group()).isAdmin) return ctx.reply(t("lang.adminOnly"));

    if (arg === "reset") {
      delete scope.lang;
      db.save(ctx.isGroup ? "groups" : "users");
      return done(defaultLang(), "lang.cleared");
    }
    if (!LANGS[arg]) return ctx.reply(t("lang.invalid", { list }));
    scope.lang = arg;
    db.save(ctx.isGroup ? "groups" : "users");
    return done(arg, ctx.isGroup ? "lang.setGroup" : "lang.setUser");
  },
});
