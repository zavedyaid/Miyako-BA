import { sniff, truncate } from "#lib/utils";

/*
 * Menampilkan respons HTTP ke WhatsApp (dipakai .get/.post/… dan .curl):
 * JSON (dirapikan), gambar, video, audio, HTML (ringkasan), teks, atau file lain sebagai dokumen.
 * flags: Set berisi "i" (tampilkan header) / "f" (paksa file) / "t" (paksa teks)
 */
export const INLINE_MAX = 3200;
const IMAGE_MAX = 15 * 1024 * 1024;

export const size = (bytes) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(2)} MB`);

const htmlToText = (html) => {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
  const body = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return { title, body };
};

const fileNameOf = (res, ext) => {
  const disposition = res.headers.get("content-disposition")?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  if (disposition) return decodeURIComponent(disposition);
  const last = new URL(res.url).pathname.split("/").filter(Boolean).pop();
  return last && /\.[a-z0-9]{1,6}$/i.test(last) ? last : `response.${ext}`;
};

export const presentResponse = async (ctx, method, res, flags) => {
  const sniffed = sniff(res.buffer);
  const headerType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const type = headerType && headerType !== "application/octet-stream" ? headerType : sniffed.mime || headerType || "application/octet-stream";
  const info = `🌐 *${method} ${truncate(res.url, 120)}*\n📡 ${res.status}${res.statusText ? ` ${res.statusText}` : ""} • ${res.ms} ms • ${type} • ${size(res.buffer.length)}${res.hops ? ` • ${res.hops} redirect` : ""}`;

  if (flags.has("i") || method === "HEAD") {
    const lines = [...res.headers].map(([k, v]) => `${k}: ${truncate(v, 160)}`);
    await ctx.reply(`${info}\n\n\`\`\`\n${truncate(lines.join("\n"), 2600)}\n\`\`\``, { preview: false });
    if (method === "HEAD") return;
  }
  if (!res.buffer.length) return flags.has("i") ? undefined : ctx.reply(`${info}\n\n_(respons kosong)_`, { preview: false });

  const asFile = flags.has("f");
  const sendFile = () =>
    ctx.reply({ document: res.buffer, mimetype: type, fileName: fileNameOf(res, sniffed.ext || "bin"), caption: info });

  if (!asFile && !flags.has("t")) {
    if (type.startsWith("image/") && !type.includes("svg")) {
      if (res.buffer.length > IMAGE_MAX) return sendFile();
      return ctx.reply({ image: res.buffer, caption: info });
    }
    if (type.startsWith("video/")) return ctx.reply({ video: res.buffer, mimetype: type, caption: info });
    if (type.startsWith("audio/")) return ctx.reply({ audio: res.buffer, mimetype: type });
  }
  if (asFile) return sendFile();

  const isTextual = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded)|.*\+(json|xml))/.test(type) || flags.has("t") || type === "application/octet-stream";
  if (!isTextual) return sendFile();

  const raw = res.buffer.toString("utf8");
  if (raw.includes("\u0000")) return sendFile(); // biner

  // JSON → rapikan
  let pretty = null;
  if (type.includes("json") || /^\s*[[{]/.test(raw)) {
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {}
  }
  if (pretty) {
    if (pretty.length <= INLINE_MAX) return ctx.reply(`${info}\n\n\`\`\`\n${pretty}\n\`\`\``, { preview: false });
    return ctx.reply({ document: Buffer.from(pretty), mimetype: "application/json", fileName: "response.json", caption: `${info}\n📄 JSON panjang — dikirim sebagai file.` });
  }

  if (type.includes("html") && !flags.has("t")) {
    const { title, body } = htmlToText(raw);
    return ctx.reply(`${info}\n\n${title ? `📰 *${truncate(title, 150)}*\n` : ""}${truncate(body, 1800) || "_(tanpa teks)_"}\n\n_Pakai -f untuk menerima HTML mentah sebagai file._`, { preview: false });
  }

  if (raw.length <= INLINE_MAX) return ctx.reply(`${info}\n\n\`\`\`\n${raw}\n\`\`\``, { preview: false });
  return ctx.reply({ document: res.buffer, mimetype: type.startsWith("text/") ? type : "text/plain", fileName: fileNameOf(res, "txt"), caption: `${info}\n📄 Respons panjang — dikirim sebagai file.` });
};

