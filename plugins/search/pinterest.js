import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { sleep } from "#lib/utils";

/*
 * Pengolahan respons Pinterest ada di plugin ini (api.js hanya menyambung ke API).
 * Bentuk respons dibaca toleran: daftar dicari di results / result / data / pins / images / items,
 * gambar di field image / url / src / media / original … atau URL gambar mana pun di dalam item.
 */
const LIST_KEYS = ["results", "result", "data", "pins", "images", "items", "list"];
const IMAGE_KEYS = ["image", "image_url", "imageUrl", "original", "orig", "url", "src", "media", "images", "thumbnail", "img"];
const STRONG_KEYS = new Set(["image", "image_url", "imageUrl", "original", "orig"]);
const IMAGE_URL = /^https?:\/\/\S+$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)(\?|$)/i;

const toList = (data, depth = 0) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object" || depth > 2) return [];
  for (const key of LIST_KEYS) if (Array.isArray(data[key])) return data[key];
  for (const key of LIST_KEYS) {
    const inner = toList(data[key], depth + 1);
    if (inner.length) return inner;
  }
  return Object.values(data).find(Array.isArray) ?? [];
};

const pickImage = (value, depth = 0, trusted = false) => {
  if (typeof value === "string") return IMAGE_URL.test(value) && (trusted || IMAGE_EXT.test(value) || depth === 0) ? value : null;
  if (!value || typeof value !== "object" || depth > 3) return null;
  for (const key of IMAGE_KEYS) {
    const found = pickImage(value[key], depth + 1, trusted || STRONG_KEYS.has(key));
    if (found) return found;
  }
  return Object.values(value).map((v) => (typeof v === "string" && IMAGE_URL.test(v) && IMAGE_EXT.test(v) ? v : null)).find(Boolean) ?? null;
};

const text = (...values) => values.find((v) => typeof v === "string" && v.trim())?.trim();

// → [{ image, title? }] tanpa duplikat
const parsePins = (data) =>
  toList(data)
    .map((item) => {
      const image = pickImage(item, typeof item === "string" ? 0 : 1);
      return image ? { image, title: typeof item === "string" ? undefined : text(item.title, item.description, item.caption, item.name) } : null;
    })
    .filter(Boolean)
    .filter((pin, i, all) => all.findIndex((other) => other.image === pin.image) === i);

const DEFAULT_COUNT = 5;
const MAX_COUNT = 10;

export default definePlugin({
  name: "pinterest",
  aliases: ["pin"],
  category: "search",
  description: "Cari gambar di Pinterest",
  usage: "pinterest <kata kunci> [| jumlah]",
  limit: 1,
  async run({ ctx }) {
    // ".pin aesthetic wallpaper" atau ".pin aesthetic wallpaper | 8"
    const [query, rawCount] = (ctx.argsStr || ctx.quotedText || "").split("|").map((v) => v.trim());
    if (!query) {
      return ctx.reply(`❌ Masukkan kata kunci.\nContoh: *${ctx.prefix}pinterest aesthetic wallpaper*\nJumlah gambar: *${ctx.prefix}pin aesthetic wallpaper | 8* (maks ${MAX_COUNT})`, {
        preview: { title: "Pinterest", body: "Cari gambar" },
      });
    }

    ctx.react("⏳");
    try {
      const pins = parsePins(await api.get("/search/pinterest", { query, limit: 20 }));
      if (!pins.length) throw new ApiError(`Tidak ada gambar untuk "${query}".`);

      const total = Math.min(Math.max(Number.parseInt(rawCount, 10) || DEFAULT_COUNT, 1), MAX_COUNT, pins.length);
      const shuffled = [...pins].sort(() => Math.random() - 0.5);

      // Gambar biasa + teks, satu per satu. Gambar yang gagal diunduh dilewati dan diganti berikutnya.
      let sent = 0;
      for (const pin of shuffled) {
        if (sent >= total) break;
        try {
          await ctx.reply({
            image: { url: pin.image },
            caption: `📌 *Pinterest* · ${sent + 1}/${total}\n🔎 ${query}${pin.title ? `\n📝 ${pin.title}` : ""}`,
          });
          sent++;
          if (sent < total) await sleep(700);
        } catch {
          // lewati
        }
      }

      if (!sent) throw new ApiError("Semua gambar gagal dikirim.");
      ctx.react("✅");
    } catch (err) {
      ctx.react("❌");
      throw err; // handler membalas pesan error & mengembalikan limit
    }
  },
});
