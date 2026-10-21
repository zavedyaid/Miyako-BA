import { lex } from "#lib/i18n";
import { definePlugin } from "#lib/plugins";
import { safeFetch } from "#lib/http";
import { presentResponse } from "#lib/httpview";
import { t as tl } from "#lib/i18n";

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

const KV = /^[^\s=&]+=[^\s]*$/;

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
            `🌐 *${ctx.pfx}${name}* — ${lex(desc)}`,
            tl("tool.http.1", { prefix: ctx.pfx, name }),
            hasBody ? tl("tool.http.2") : tl("tool.http.3"),
            tl("tool.http.4"),
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
          if (!form) return ctx.reply(tl("tool.http.5"));
          const target = new URL(url);
          for (const t of tokens) target.searchParams.append(t.slice(0, t.indexOf("=")), t.slice(t.indexOf("=") + 1));
          url = target.href;
        } else if (/^[[{]/.test(parsed.body)) {
          try {
            JSON.parse(parsed.body);
          } catch (err) {
            return ctx.reply(tl("tool.http.6", { message: err.message }));
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
        await presentResponse(ctx, method, res, parsed.flags);
        ctx.react(res.status < 400 ? "✅" : "⚠️");
      } catch (err) {
        ctx.react("❌");
        throw err;
      }
    },
  });

export default METHODS.map(build);
