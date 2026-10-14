import { definePlugin } from "#lib/plugins";
import { safeFetch } from "#lib/http";
import { sniff, truncate } from "#lib/utils";

/*
 * Ambil / kirim data ke website apa pun (khusus premium & owner). Hanya alamat publik; redirect dicek ulang.
 *   .get  <url> [k=v …]            → query dari k=v      (JSON, gambar, video, audio, teks, HTML, file apa saja)
 *   .post <url> <body>             → body JSON  {"a":1}  atau  k=v k2=v2 (form)  atau teks biasa
 *   .put .patch  → seperti post     .delete .head → seperti get
 * Opsi: -H "Nama: nilai" (header, boleh berkali-kali) • -f paksa kirim sebagai file • -t paksa tampil sebagai teks • -i tampilkan header respons
 * Contoh: .get https://api.github.com/users/octocat
 *         .post https://httpbin.org/post {"halo":"dunia"} -H "Authorization: Bearer xxx"
 */
const METHODS = [
  { name: "get", aliases: ["fetch"], body: false, desc: "Ambil data dari website (JSON, gambar, video, dll)" },
  { name: "post", aliases: [], body: true, desc: "Kirim POST ke website" },
  { name: "put", aliases: [], body: true, desc: "Kirim PUT ke website" },
  { name: "patch", aliases: [], body: true, desc: "Kirim PATCH ke website" },
  { name: "delete", aliases: ["del"], body: false, desc: "Kirim DELETE ke website" },
  { name: "head", aliases: [], body: false, desc: "Lihat header respons website" },
];

const INLINE_MAX = 3200;
const IMAGE_MAX = 15 * 1024 * 1024;
const KV = /^[^\s=&]+=[^\s]*$/;

const size = (bytes) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(2)} MB`);

const parse = (input) => {
  const headers = {};
  const flags = new Set();

  let rest = input.replace(/(?:^|\s)(?:-H|--header)\s+(?:"([^"]*)"|'([^']*)'|(\S+))/g, (_, dq, sq, bare) => {
    const line = dq ?? sq ?? bare;
    const at = line.indexOf(":");
    if (at > 0) headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    return " ";
  });
  rest = rest.replace(/(?:^|\s)(-f|--file|-t|--text|-i|--include)(?=\s|$)/g, (_, flag) => {
    flags.add(flag.replace(/^-+/, "")[0]);
    return " ";
  });

  const match = rest.match(/https?:\/\/\S+/i) ?? rest.match(/(?:^|\s)((?:[\w-]+\.)+[a-z]{2,}(?:[/:?#]\S*)?)(?=\s|$)/i);
  if (!match) return null;
  const token = match[1] && !/^https?:/i.test(match[0]) ? match[1] : match[0];
  const url = /^https?:/i.test(token) ? token : `https://${token}`;
  const body = rest.replace(token, " ").trim();
  return { url, body, headers, flags };
};

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

const present = async (ctx, method, res, flags) => {
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

const build = ({ name, aliases, body: hasBody, desc }) =>
  definePlugin({
    name,
    aliases,
    category: "tools",
    description: desc,
    usage: `${name} <url>${hasBody ? " <body>" : " [k=v …]"} [-H "Nama: nilai"] [-f|-t|-i]`,
    access: { premium: true },
    async run({ ctx }) {
      const parsed = parse(`${ctx.argsStr} ${ctx.argsStr ? "" : (ctx.quotedText ?? "")}`.trim());
      if (!parsed) {
        return ctx.reply(
          [
            `🌐 *${ctx.prefix}${name}* — ${desc}`,
            `Contoh: *${ctx.prefix}${name} https://api.github.com/users/octocat*`,
            hasBody ? `Body: JSON {"a":1} • form a=1 b=2 • atau teks biasa` : "Parameter: tambah k=v setelah URL",
            `Opsi: -H "Nama: nilai" • -f kirim sebagai file • -t paksa teks • -i tampilkan header`,
          ].join("\n"),
        );
      }

      const method = name.toUpperCase();
      const headers = { "User-Agent": "Mozilla/5.0 (compatible; MiyakoBot/1.0)", Accept: "*/*", ...parsed.headers };
      let url = parsed.url;
      let body;

      if (parsed.body) {
        const tokens = parsed.body.split(/[\s&]+/).filter(Boolean);
        const form = tokens.length > 0 && tokens.every((t) => KV.test(t));
        if (!hasBody) {
          if (!form) return ctx.reply("❌ Untuk method ini tulis parameter sebagai k=v (contoh: q=halo page=2).");
          const target = new URL(url);
          for (const t of tokens) target.searchParams.append(t.slice(0, t.indexOf("=")), t.slice(t.indexOf("=") + 1));
          url = target.href;
        } else if (/^[[{]/.test(parsed.body)) {
          try {
            JSON.parse(parsed.body);
          } catch (err) {
            return ctx.reply(`❌ JSON tidak valid: ${err.message}`);
          }
          body = parsed.body;
          headers["Content-Type"] ??= "application/json";
        } else if (form) {
          body = new URLSearchParams(tokens.map((t) => [t.slice(0, t.indexOf("=")), t.slice(t.indexOf("=") + 1)])).toString();
          headers["Content-Type"] ??= "application/x-www-form-urlencoded";
        } else {
          body = parsed.body;
          headers["Content-Type"] ??= "text/plain; charset=utf-8";
        }
      }

      ctx.react("⏳");
      try {
        const res = await safeFetch(url, { method, headers, body });
        await present(ctx, method, res, parsed.flags);
        ctx.react(res.status < 400 ? "✅" : "⚠️");
      } catch (err) {
        ctx.react("❌");
        throw err;
      }
    },
  });

export default METHODS.map(build);
