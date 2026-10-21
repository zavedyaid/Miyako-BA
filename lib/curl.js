import { t as tl } from "#lib/i18n";
/*
 * Parser perintah curl → permintaan HTTP.
 *   parseCurl('curl -X POST https://x.id/api -H "A: b" -d \'{"k":1}\'')
 *   → { method, url, headers, body, flags: Set, timeout }   (melempar Error berpesan jelas bila opsi tidak didukung)
 * Didukung: -X -H -d/--data/--data-raw/--data-binary/--data-urlencode --json -F -u -A -e -b -G -I -i -m -o -O
 * Diabaikan (tidak berpengaruh): -L -s -S -k -v -f --compressed --http1.1 --http2 --retry --connect-timeout -w
 */
const QUOTES = { "“": '"', "”": '"', "„": '"', "‘": "'", "’": "'" };

// Tokenisasi ala shell: kutip ganda / tunggal, backslash, dan sambungan baris "\ + enter".
export const tokenize = (input) => {
  const text = [...input].map((ch) => QUOTES[ch] ?? ch).join("").replace(/\\\r?\n/g, " ");
  const tokens = [];
  let current = "";
  let started = false;
  let quote = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else current += ch;
    } else if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === "\\" && /["\\$`]/.test(text[i + 1] ?? "")) current += text[++i];
      else current += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      started = true;
    } else if (ch === "\\" && i + 1 < text.length) {
      current += text[++i];
      started = true;
    } else if (/\s/.test(ch)) {
      if (started || current) tokens.push(current);
      current = "";
      started = false;
    } else {
      current += ch;
      started = true;
    }
  }
  if (quote) throw new Error(tl("lb.curl.curl.1"));
  if (started || current) tokens.push(current);
  return tokens;
};

const WITH_VALUE = {
  "-X": "request", "--request": "request",
  "-H": "header", "--header": "header",
  "-d": "data", "--data": "data", "--data-raw": "data", "--data-binary": "data", "--data-ascii": "data",
  "--data-urlencode": "urlencode",
  "--json": "json",
  "-F": "form", "--form": "form",
  "-u": "user", "--user": "user",
  "-A": "agent", "--user-agent": "agent",
  "-e": "referer", "--referer": "referer",
  "-b": "cookie", "--cookie": "cookie",
  "-m": "maxtime", "--max-time": "maxtime",
  "-o": "output", "--output": "output",
  "--connect-timeout": "ignore", "--retry": "ignore", "-w": "ignore", "--write-out": "ignore",
  "--url": "url",
};
const FLAGS = {
  "-G": "get", "--get": "get",
  "-I": "head", "--head": "head",
  "-i": "include", "--include": "include",
  "-O": "remote", "--remote-name": "remote",
  "-L": null, "--location": null, "-s": null, "--silent": null, "-S": null, "--show-error": null, "-k": null, "--insecure": null,
  "-v": null, "--verbose": null, "-f": null, "--fail": null, "--compressed": null, "--http1.1": null, "--http2": null, "-g": null, "--globoff": null,
};
const UNSUPPORTED = new Set(["-x", "--proxy", "-T", "--upload-file", "--cert", "--key", "--cacert", "-K", "--config", "--unix-socket", "--interface", "--resolve", "--connect-to"]);

export const parseCurl = (input) => {
  let tokens = tokenize(input.trim());
  if (/^curl$/i.test(tokens[0] ?? "")) tokens = tokens.slice(1);

  // Gabungan flag pendek: -sSL → -s -S -L
  tokens = tokens.flatMap((t) => (/^-[a-zA-Z]{2,}$/.test(t) && !(t in FLAGS) && !(t in WITH_VALUE) ? [...t.slice(1)].map((c) => `-${c}`) : [t]));

  const out = { method: null, url: null, headers: {}, data: [], urlencode: [], json: null, form: [], flags: new Set(), timeout: 30_000 };
  let asGet = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const eq = t.startsWith("--") ? t.indexOf("=") : -1;
    const name = eq > 0 ? t.slice(0, eq) : t;

    if (UNSUPPORTED.has(name)) throw new Error(tl("lb.curl.curl.2", { name }));
    if (name in WITH_VALUE) {
      const value = eq > 0 ? t.slice(eq + 1) : tokens[++i];
      if (value === undefined) throw new Error(`Opsi ${name} butuh nilai.`);
      switch (WITH_VALUE[name]) {
        case "request": out.method = value.toUpperCase(); break;
        case "header": {
          const at = value.indexOf(":");
          if (at > 0) out.headers[value.slice(0, at).trim()] = value.slice(at + 1).trim();
          break;
        }
        case "data": {
          if (value.startsWith("@")) throw new Error(tl("lb.curl.curl.3"));
          out.data.push(value);
          break;
        }
        case "urlencode": {
          const at = value.indexOf("=");
          out.urlencode.push(at >= 0 ? `${at > 0 ? `${value.slice(0, at)}=` : ""}${encodeURIComponent(value.slice(at + 1))}` : encodeURIComponent(value));
          break;
        }
        case "json": out.json = value; break;
        case "form": {
          const at = value.indexOf("=");
          if (at <= 0) throw new Error(tl("lb.curl.curl.4", { value }));
          if (value.slice(at + 1).startsWith("@")) throw new Error(tl("lb.curl.curl.5"));
          out.form.push([value.slice(0, at), value.slice(at + 1)]);
          break;
        }
        case "user": out.headers.Authorization = `Basic ${Buffer.from(value).toString("base64")}`; break;
        case "agent": out.headers["User-Agent"] = value; break;
        case "referer": out.headers.Referer = value; break;
        case "cookie": out.headers.Cookie = value; break;
        case "maxtime": out.timeout = Math.min(60, Math.max(1, Number(value) || 30)) * 1000; break;
        case "output": out.flags.add("f"); break;
        case "url": out.url = value; break;
        default: break;
      }
    } else if (name in FLAGS) {
      const kind = FLAGS[name];
      if (kind === "get") asGet = true;
      if (kind === "head") out.method = "HEAD";
      if (kind === "include") out.flags.add("i");
      if (kind === "remote") out.flags.add("f");
    } else if (t.startsWith("-") && t.length > 1) {
      throw new Error(tl("lb.curl.curl.6", { t }));
    } else if (!out.url) {
      out.url = t;
    } else {
      throw new Error(tl("lb.curl.curl.7", { t, url: out.url }));
    }
  }

  if (!out.url) throw new Error(tl("lb.curl.curl.8"));
  if (!/^https?:\/\//i.test(out.url)) out.url = `https://${out.url}`;

  // Susun body / query seperti curl
  const pieces = [...out.data, ...out.urlencode];
  let body;
  if (out.json !== null) {
    JSON.parse(out.json);
    body = out.json;
    out.headers["Content-Type"] ??= "application/json";
    out.headers.Accept ??= "application/json";
  } else if (out.form.length) {
    body = new FormData();
    for (const [k, v] of out.form) body.append(k, v);
  } else if (pieces.length) {
    body = pieces.join("&");
    if (!/^[[{]/.test(body)) out.headers["Content-Type"] ??= "application/x-www-form-urlencoded";
    else out.headers["Content-Type"] ??= "application/json"; // curl memakai form-urlencoded; JSON mentah hampir selalu maksudnya JSON
  }

  if (asGet && typeof body === "string") {
    const target = new URL(out.url);
    for (const [k, v] of new URLSearchParams(body)) target.searchParams.append(k, v);
    out.url = target.href;
    body = undefined;
  }

  out.method ??= body !== undefined ? "POST" : "GET";
  if (out.method === "HEAD") body = undefined;
  return { method: out.method, url: out.url, headers: out.headers, body, flags: out.flags, timeout: out.timeout };
};
