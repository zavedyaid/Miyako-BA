import chalk from "chalk";

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

const banner = ({ name, version, node }) => {
  const art = [
    "╭──────────────────────────────────────────╮",
    "│                                          │",
    "│   ❄   Y  U  K  I     A  R  C  H  I  V  E │",
    "│                                          │",
    "╰──────────────────────────────────────────╯",
  ];
  console.log();
  for (const line of art) console.log(chalk.cyanBright(line));
  console.log(chalk.gray(`   ${name} · v${version} · Node ${node} · Baileys ZavedyaID\n`));
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
