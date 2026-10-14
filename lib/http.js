import dns from "node:dns/promises";
import net from "node:net";

/*
 * fetch yang aman untuk URL buatan pengguna (.get / .post / …):
 *   • hanya http/https ke alamat PUBLIK — localhost, jaringan lokal/privat, dan alamat metadata cloud diblokir (SSRF)
 *   • redirect diikuti manual (maks 5) dan tiap tujuan diperiksa ulang
 *   • ukuran respons dibatasi, ada timeout
 */
export const MAX_RESPONSE = 50 * 1024 * 1024;

const v4Private = ([a, b]) =>
  a === 0 || a === 10 || a === 127 || a >= 224 ||
  (a === 100 && b >= 64 && b <= 127) ||
  (a === 169 && b === 254) ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && (b === 168 || b === 0)) ||
  (a === 198 && (b === 18 || b === 19));

// Perluas IPv6 ke 8 kelompok 16-bit (null bila bukan IPv6 valid).
const expandV6 = (address) => {
  const [head, tail = null] = address.split("::");
  if (address.split("::").length > 2) return null;
  const toGroups = (part) => (part ? part.split(":") : []);
  let groups = toGroups(head);
  if (tail !== null) {
    const rest = toGroups(tail);
    groups = [...groups, ...Array(Math.max(0, 8 - groups.length - rest.length)).fill("0"), ...rest];
  }
  // sufiks dotted (::ffff:1.2.3.4) → dua kelompok hex
  const last = groups.at(-1);
  if (last?.includes(".")) {
    const o = last.split(".").map(Number);
    groups = [...groups.slice(0, -1), ((o[0] << 8) | o[1]).toString(16), ((o[2] << 8) | o[3]).toString(16)];
  }
  return groups.length === 8 ? groups.map((g) => parseInt(g || "0", 16)) : null;
};

export const isPrivateAddress = (address) => {
  if (net.isIPv4(address)) return v4Private(address.split(".").map(Number));
  if (net.isIPv6(address)) {
    const g = expandV6(address.toLowerCase());
    if (!g || g.some(Number.isNaN)) return true;
    const embedded = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
    const zeros = g.slice(0, 5).every((x) => x === 0);
    if (zeros && (g[5] === 0xffff || g[5] === 0)) {
      // ::, ::1, ::ffff:a.b.c.d, ::a.b.c.d (IPv4-mapped / compatible)
      return g.slice(0, 7).every((x) => x === 0) || v4Private(embedded);
    }
    if (g[0] === 0x64 && g[1] === 0xff9b) return v4Private(embedded); // NAT64
    if (g[0] === 0x2002) return v4Private([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255]); // 6to4
    return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00;
  }
  return true;
};

export const assertPublicUrl = async (input) => {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("URL tidak valid.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Hanya mendukung http:// dan https://.");

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Alamat lokal / internal tidak diizinkan.");
  }

  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new Error(`Domain tidak ditemukan: ${host}`);
  if (addresses.some(isPrivateAddress)) throw new Error("Alamat lokal / jaringan privat tidak diizinkan.");
  return url;
};

export const safeFetch = async (input, { method = "GET", headers = {}, body, timeout = 30_000, maxBytes = MAX_RESPONSE, maxRedirects = 5 } = {}) => {
  const started = performance.now();
  const signal = AbortSignal.timeout(timeout);
  let current = input;
  let verb = method;
  let payload = body;
  let hops = 0;

  for (;;) {
    const url = await assertPublicUrl(current);
    let res;
    try {
      res = await fetch(url, { method: verb, headers, body: payload, redirect: "manual", signal });
    } catch (err) {
      throw new Error(err.name === "TimeoutError" ? `Timeout setelah ${timeout / 1000} detik.` : `Gagal terhubung: ${err.cause?.code ?? err.message}`);
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      if (++hops > maxRedirects) throw new Error(`Terlalu banyak redirect (>${maxRedirects}).`);
      current = new URL(location, url).href;
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && verb === "POST")) {
        verb = "GET";
        payload = undefined;
      }
      continue;
    }

    const declared = Number(res.headers.get("content-length"));
    if (declared > maxBytes) throw new Error(`Respons terlalu besar (${(declared / 1024 / 1024).toFixed(1)} MB, maks ${maxBytes / 1024 / 1024} MB).`);

    const chunks = [];
    let size = 0;
    if (res.body && verb !== "HEAD") {
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > maxBytes) throw new Error(`Respons terlalu besar (maks ${maxBytes / 1024 / 1024} MB).`);
        chunks.push(chunk);
      }
    }

    return {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
      buffer: Buffer.concat(chunks),
      url: url.href,
      hops,
      ms: Math.round(performance.now() - started),
    };
  }
};
