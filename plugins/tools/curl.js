import { definePlugin } from "#lib/plugins";
import { parseCurl } from "#lib/curl";
import { presentResponse } from "#lib/httpview";
import { safeFetch } from "#lib/http";
import { t as tl } from "#lib/i18n";

/*
 * .curl <perintah curl>  — tempel perintah curl apa adanya (awalan "curl" boleh dihilangkan).
 *   .curl https://api.github.com/users/octocat
 *   .curl -X POST https://httpbin.org/post -H "Content-Type: application/json" -d '{"a":1}'
 *   .curl -I https://example.com          (hanya header)     .curl -i … (tampilkan header)     .curl -o … (kirim sebagai file)
 * Hanya alamat publik (localhost / jaringan privat diblokir), maks 50 MB. Premium & owner.
 * Opsi: -X -H -d --data-raw --data-urlencode --json -F -u -A -e -b -G -I -i -m -o   (lihat lib/curl.js)
 */
export default definePlugin({
  name: "curl",
  aliases: ["curlx"],
  category: "tools",
  description: "Jalankan permintaan HTTP ala curl (JSON, gambar, video, dll)",
  usage: "curl [opsi] <url>",
  access: { premium: true },
  async run({ ctx }) {
    const input = ctx.argsStr || ctx.quotedText;
    if (!input) {
      return ctx.reply(
        [
          tl("cu3.1", { pfx: ctx.pfx }),
          tl("cu3.2", { pfx: ctx.pfx }),
          tl("cu3.3", { pfx: ctx.pfx }),
          tl("tool.curl.1", { prefix: ctx.pfx }),
          tl("cu3.4"),
        ].join("\n"),
      );
    }

    let req;
    try {
      req = parseCurl(input);
    } catch (err) {
      return ctx.reply(`❌ ${err.message}`);
    }

    ctx.react("⏳");
    try {
      const headers = { "User-Agent": "curl/8.5.0", Accept: "*/*", ...req.headers };
      const res = await safeFetch(req.url, { method: req.method, headers, body: req.body, timeout: req.timeout });
      await presentResponse(ctx, req.method, res, req.flags);
      ctx.react(res.status < 400 ? "✅" : "⚠️");
    } catch (err) {
      ctx.react("❌");
      throw err;
    }
  },
});
