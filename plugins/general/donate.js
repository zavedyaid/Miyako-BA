import { existsSync } from "node:fs";
import path from "node:path";
import { definePlugin } from "#lib/plugins";
import { deliver } from "#lib/interactive";
import { fakeQuoted } from "#lib/utils";

/*
 * Donasi = SATU pesan produk katalog WhatsApp (tombol "Lihat katalog" membuka halaman produk).
 * Atur di config.json → "donate":
 *   catalog     : link produk katalog, mis. "https://wa.me/p/<idProduk>/<nomorBisnis>"
 *   title       : judul produk di kartu (default "Donasi - Seikhlasnya")
 *   description : deskripsi produk di kartu
 *   text        : kalimat pembuka di isi pesan
 *   accounts    : [{ "text": "📋 DANA", "code": "0812…" }]   → nomor tampil di isi pesan
 *   links       : [{ "text": "💖 Saweria", "url": "https://…" }] → tampil di isi pesan
 *   price       : (opsional) harga di kartu produk, Rupiah; kosong = 0 (seikhlasnya)
 * Gambar produk = config/qris.jpg (atau .png) kalau ada; kalau tidak, config/thumbnail.jpg.
 */
const CATALOG = /wa\.me\/p\/(\d+)\/(\d+)/;

const imagePath = (dir) => {
  for (const name of ["qris.jpg", "qris.jpeg", "qris.png", "thumbnail.jpg"]) {
    const file = path.join(dir, name);
    if (existsSync(file)) return file;
  }
  return undefined;
};

const bare = (label) => label.replace(/^[^\p{L}\p{N}]+/u, "");

export default definePlugin({
  name: "donate",
  aliases: ["donasi"],
  category: "general",
  description: "Dukung pengembangan bot (katalog donasi)",
  async run({ ctx, sock, config }) {
    const donate = config.donate ?? {};
    const title = donate.title ?? "Donasi - Seikhlasnya";
    const accounts = donate.accounts ?? [];
    const links = donate.links ?? [];

    const body = [
      `*${title}*`,
      donate.text ?? "Terima kasih sudah mendukung bot ini ❤️",
      ...(accounts.length ? ["", ...accounts.map((a) => `• ${bare(a.text)}: ${a.code}`)] : []),
      ...(links.length ? ["", ...links.map((l) => `• ${bare(l.text)}: ${l.url}`)] : []),
    ].join("\n");

    const match = String(donate.catalog ?? "").match(CATALOG);
    if (!match) return ctx.reply(body); // katalog belum diatur → teks biasa
    const [, productId, ownerNumber] = match;

    const image = imagePath(config.paths.config);

    await deliver(
      sock,
      ctx.chatId,
      {
        ...(image && { image: { url: image } }),
        body,
        footer: config.name,
        product: {
          currencyCode: "IDR",
          title,
          description: donate.description ?? "Berapapun donasinya",
          priceAmount1000: Math.round((donate.price ?? 0) * 1000),
          productId,
          productImageCount: 1,
          signedUrl: donate.catalog,
          url: donate.catalog,
        },
        businessOwnerJid: `${ownerNumber}@s.whatsapp.net`,
      },
      { quoted: fakeQuoted.contact(config.name) },
      "Katalog donasi",
    );
  },
});
