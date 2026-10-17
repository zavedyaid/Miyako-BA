import chalk from "chalk";
import { ASCII_LARGE, ASCII_SMALL, ASCII_TINY, BRAILLE_LARGE, BRAILLE_SMALL, BRAILLE_TINY } from "#lib/banner-art";

const ANSI = /\u001b\[[0-9;]*m/g;
const visible = (text) => String(text).replace(ANSI, "");
const clock = () => new Date().toLocaleTimeString("id-ID", { hour12: false }).replaceAll(".", ":");

const KINDS = {
  info: ["ℹ", "INFO", chalk.cyan],
  ok: ["✔", "OK", chalk.green],
  warn: ["⚠", "WARN", chalk.yellow],
  error: ["✖", "ERROR", chalk.red],
  conn: ["◈", "CONN", chalk.blue],
  plugin: ["⬡", "PLUGIN", chalk.magenta],
  debug: ["·", "DEBUG", chalk.gray],
};

const emit = (kind, parts) => {
  if (kind === "debug" && !process.env.DEBUG) return;
  const [icon, label, paint] = KINDS[kind];
  console.log(`${chalk.gray(clock())}  ${paint(icon)} ${paint.bold(label.padEnd(6))} ${chalk.gray("│")}`, ...parts);
};

const box = (title, rows = [], paint = chalk.cyan) => {
  const lines = rows.map(String);
  const width = Math.max(visible(title).length + 2, ...lines.map((l) => visible(l).length));
  const pad = (text) => text + " ".repeat(width - visible(text).length);
  const bar = "─".repeat(width + 2);

  console.log(paint(`╭${bar}╮`));
  console.log(paint("│ ") + chalk.bold.white(pad(title)) + paint(" │"));
  if (lines.length) console.log(paint(`├${bar}┤`));
  for (const line of lines) console.log(paint("│ ") + pad(line) + paint(" │"));
  console.log(paint(`╰${bar}╯`));
};

// Warna gradasi per baris (atas → bawah). chalk menurunkan otomatis bila terminal tidak mendukung truecolor.
const GRADIENT = [[142, 231, 255], [170, 190, 255], [200, 160, 255]];
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const shade = (t) => {
  const seg = Math.min(GRADIENT.length - 2, Math.floor(t * (GRADIENT.length - 1)));
  const local = t * (GRADIENT.length - 1) - seg;
  const [c1, c2] = [GRADIENT[seg], GRADIENT[seg + 1]];
  return chalk.rgb(lerp(c1[0], c2[0], local), lerp(c1[1], c2[1], local), lerp(c1[2], c2[2], local));
};

const CREDITS = [
  ["Developer", "ZavedyaID"],
  ["Base", "RullzFuqi"],
  ["Baileys", "zavedyaid/baileys"],
];

// Banner: ASCII art maskot (dari tools/make-banner-art.py) + nama bot + kredit.
// Ukuran mengikuti lebar terminal. Konsol panel / pipe (lebar tidak diketahui, biasanya sempit di HP) memakai versi kecil.
//   BANNER_SIZE=large|small|tiny|none   • BANNER_ASCII=1 (atau TERM=linux) → huruf biasa tanpa braille
const ART = {
  braille: { large: BRAILLE_LARGE, small: BRAILLE_SMALL, tiny: BRAILLE_TINY },
  ascii: { large: ASCII_LARGE, small: ASCII_SMALL, tiny: ASCII_TINY },
};

export const pickBanner = ({ columns = process.stdout.columns, env = process.env } = {}) => {
  const plain = env.BANNER_ASCII === "1" || env.TERM === "linux";
  const known = Number.isFinite(columns) && columns > 0;
  const requested = String(env.BANNER_SIZE ?? "").toLowerCase();
  const size = ["large", "small", "tiny", "none"].includes(requested) ? requested : !known ? "small" : columns >= 66 ? "large" : columns >= 40 ? "small" : columns >= 30 ? "tiny" : "none";
  return { size, art: size === "none" ? [] : ART[plain ? "ascii" : "braille"][size] };
};

const banner = ({ name, version, node }) => {
  const { art } = pickBanner();
  const artWidth = Math.max(0, ...art.map((l) => l.length));

  console.log();
  art.forEach((line, i) => console.log(`  ${shade(art.length > 1 ? i / (art.length - 1) : 0)(line)}`));

  // Kotak nama bot, huruf direnggangkan: M I Y A K O   B A
  const title = String(name).toUpperCase().split(/\s+/).map((word) => [...word].join(" ")).join("   ");
  const inner = Math.max(title.length + 6, 24);
  const margin = Math.max(0, Math.floor((Math.max(artWidth, inner + 2) - (inner + 2)) / 2)) + 2;
  const pad = " ".repeat(margin);
  const left = Math.floor((inner - title.length) / 2);
  console.log();
  console.log(pad + chalk.cyanBright(`╭${"─".repeat(inner)}╮`));
  console.log(pad + chalk.cyanBright("│") + " ".repeat(left) + chalk.bold.white(title) + " ".repeat(inner - left - title.length) + chalk.cyanBright("│"));
  console.log(pad + chalk.cyanBright(`╰${"─".repeat(inner)}╯`));

  console.log(chalk.gray(`${pad}v${version} · Node ${node}`));
  const width = Math.max(...CREDITS.map(([k]) => k.length));
  for (const [key, value] of CREDITS) console.log(`${pad}${chalk.magentaBright("✦")} ${chalk.gray(key.padEnd(width))} ${chalk.gray(":")} ${chalk.whiteBright(value)}`);
  console.log();
};

const cmd = ({ command, name, number, where }) =>
  console.log(
    `${chalk.gray(clock())}  ${chalk.magentaBright("❯")} ${chalk.magentaBright.bold("CMD   ")} ${chalk.gray("│")}`,
    chalk.white.bold(command),
    chalk.gray("←"),
    chalk.cyan(name),
    chalk.gray(`(${number})`),
    where ? chalk.blue(`[${where}]`) : chalk.yellow("[private]"),
  );

export const logger = {
  info: (...a) => emit("info", a),
  ok: (...a) => emit("ok", a),
  warn: (...a) => emit("warn", a),
  error: (...a) => emit("error", a),
  conn: (...a) => emit("conn", a),
  plugin: (...a) => emit("plugin", a),
  debug: (...a) => emit("debug", a),
  cmd,
  box,
  banner,
  chalk,
};
