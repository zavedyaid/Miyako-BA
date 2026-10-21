import { currentLang } from "#lib/i18n";

/*
 * Teks dua bahasa langsung di kode: tr("teks Indonesia", "English text").
 * Mengikuti bahasa pesan yang sedang diproses (grup → pengguna → default bot); selain Indonesia → English.
 */
export const tr = (id, en) => (currentLang() === "id" ? id : en);
export const fmt = (n) => Number(n ?? 0).toLocaleString(currentLang() === "id" ? "id-ID" : "en-US");
