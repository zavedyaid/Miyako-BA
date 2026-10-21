import path from "node:path";
import { channelContext } from "#lib/channel";
import { config } from "#lib/config";
import { logger } from "#lib/logger";
import { getThumbnail } from "#lib/utils";

/*
 * Pesan interaktif lewat API bawaan @zavedyaid/baileys (sock.sendMessage + nativeFlow).
 * Satu pesan = gambar besar (config/thumbnail.jpg) + baris promo + teks + tombol.
 *
 * Tombol dideskripsikan sederhana:
 *   { type: "url",   text, url }
 *   { type: "copy",  text, code }
 *   { type: "call",  text, number }
 *   { type: "quick", text, id, icon? }      ← tombol balas ↩, tap langsung jalan
 *   { type: "list",  text, sections: [{ title, highlight_label?, rows: [{ title, description, header?, highlight_label?, id }] }] }
 *       header = teks kecil di baris (mis. "12 features") · highlight_label = lencana hijau (mis. "Popular")
 *
 * Opsi sendInteractive:
 *   wrap: { text, title }  → bungkus SEMUA tombol jadi satu tombol yang membuka sheet daftar
 *                            (baris dengan panah balas ↩, sekali tap langsung jalan)
 *   image: Buffer          → ganti gambar header (bawaan config/thumbnail.jpg);  fallbackImage: true → gambar itu tetap dikirim bila tombol ditolak
 *   offer: false           → matikan promo (default selalu ada, diatur di config.json → promo)
 * Semua pesan ditandai "diteruskan dari channel" (config.json → newsletterJid, ChannelName).
 */

const toFlow = (button) => {
  switch (button.type) {
    case "url":
      return { text: button.text, url: button.url };
    case "copy":
      return { text: button.text, copy: button.code };
    case "call":
      return { text: button.text, call: String(button.number).replace(/\D/g, "") };
    case "quick":
      return { text: button.text, id: button.id, ...(button.icon && { icon: button.icon }) };
    default:
      return {
        text: button.text,
        sections: button.sections.map((s) => ({
          title: s.title ?? "",
          ...(s.highlight_label && { highlight_label: s.highlight_label }),
          rows: s.rows.map((r) => ({ header: "", description: "", ...r })),
        })),
      };
  }
};

// Kirim dengan batas waktu: pesan interaktif yang menggantung / ditolak tak boleh membuat command diam saja.
const SEND_TIMEOUT = 20_000;
export const deliver = async (sock, jid, content, options, label) => {
  let timer;
  try {
    const result = await Promise.race([
      sock.sendMessage(jid, content, options),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: tidak ada respons ${SEND_TIMEOUT / 1000} detik`)), SEND_TIMEOUT);
      }),
    ]);
    return result;
  } finally {
    clearTimeout(timer);
  }
};

const offerFields = (promo) => {
  const ms = Date.now() + (promo.hours ?? 24) * 3600 * 1000;
  return {
    offerText: promo.text,
    offerCode: promo.code,
    offerUrl: promo.url ?? config.social?.website ?? "https://zavedya.id",
    offerExpiration: promo.expiryUnit === "s" ? Math.floor(ms / 1000) : ms,
  };
};

export const sendInteractive = async (sock, jid, { text, footer, buttons, mentions, quoted, offer, wrap, image: customImage, fallbackImage = false } = {}) => {
  const promo = offer === false ? null : { ...config.promo, ...offer };
  const image = customImage ?? getThumbnail();

  const content = {
    ...(image ? { image, caption: text } : { text }),
    footer: footer ?? config.name,
    nativeFlow: buttons.map(toFlow),
    ...(wrap && { optionText: wrap.text, optionTitle: wrap.title ?? wrap.text }),
    ...(promo?.text && offerFields(promo)),
    ...(mentions?.length && { mentions }),
    contextInfo: channelContext(),
  };

  try {
    return await deliver(sock, jid, content, { quoted }, "Pesan interaktif");
  } catch (err) {
    logger.warn(`Interactive message failed (${err.message}) — sending plain text`);
    // fallbackImage: gambar kustom (mis. papan catur) tetap dikirim walau tombol interaktif ditolak.
    return sock.sendMessage(jid, fallbackImage && customImage ? { image: customImage, caption: text, ...(mentions && { mentions }) } : { text, ...(mentions && { mentions }) }, { quoted });
  }
};
