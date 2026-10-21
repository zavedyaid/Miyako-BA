import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "#lib/config";
import { db } from "#lib/database";
import { logger } from "#lib/logger";

/*
 * Bahasa / language. English is the default; Indonesian is available.
 *
 *   t("key", { name })   → teks sesuai bahasa pesan yang sedang diproses (AsyncLocalStorage, tanpa perlu oper ctx)
 *   Isi teks ada di config/lang/<kode>.json — placeholder ditulis {nama}. Kunci yang belum ada di bahasa itu jatuh ke English.
 *
 * Urutan pilihan bahasa:  grup (.lang di grup) → pengguna (.lang di chat pribadi) → default bot (.lang default / settings) → config.language → "en"
 * Menambah bahasa: tambah file config/lang/xx.json lalu daftarkan di LANGS di bawah.
 */
export const LANGS = { en: "English", id: "Bahasa Indonesia" };
export const LOCALES = { en: "en-US", id: "id-ID" };

const tables = {};
export const loadLang = () => {
  for (const code of Object.keys(LANGS)) {
    try {
      tables[code] = JSON.parse(fs.readFileSync(path.join(config.paths.config, "lang", `${code}.json`), "utf8"));
    } catch (err) {
      logger.warn(`Language file ${code}.json failed to load: ${err.message}`);
      tables[code] ??= {};
    }
  }
};
loadLang();

const store = new AsyncLocalStorage();
const valid = (code) => (code && LANGS[code] ? code : null);

export const defaultLang = () => valid(db.settings?.lang) ?? valid(config.language) ?? "en";
export const resolveLang = ({ user, chat } = {}) => valid(chat?.lang) ?? valid(user?.lang) ?? defaultLang();
export const withLang = (lang, fn) => store.run({ lang }, fn);
export const currentLang = () => store.getStore()?.lang ?? defaultLang();
export const localeOf = (lang = currentLang()) => LOCALES[lang] ?? "en-US";

export const translate = (lang, key, vars = {}) => {
  const text = tables[lang]?.[key] ?? tables.en?.[key] ?? key;
  return String(text).replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`));
};
export const t = (key, vars) => translate(currentLang(), key, vars);

// Kunci opsional: undefined kalau tidak ada (untuk daftar yang panjangnya bisa beda antar bahasa).
export const has = (key) => (tables[currentLang()]?.[key] ?? tables.en?.[key]) !== undefined;

// Nama data game (item, monster, misi, gelar…): kunci "lex.<teks asli Indonesia>". Bahasa tanpa entri → teks asli dipakai apa adanya.
export const lex = (text) => tables[currentLang()]?.[`lex.${text}`] ?? text;
