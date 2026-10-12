import { definePlugin } from "#lib/plugins";

const digits = (value) => String(value ?? "").replace(/\D/g, "");

export default definePlugin({
  name: "owner",
  aliases: ["dev", "developer", "creator"],
  category: "general",
  description: "Kirim kontak developer bot",
  async run({ ctx, config }) {
    const numbers = (config.ownerNumbers?.length ? config.ownerNumbers : [config.number]).map(digits).filter(Boolean);
    if (!numbers.length) return ctx.reply("❌ Nomor owner belum diatur di config.json.");

    const contacts = numbers.map((number, i) => {
      const name = i === 0 ? config.owner : `${config.owner} ${i + 1}`;
      return {
        vcard: [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `N:;${name};;;`,
          `FN:${name}`,
          `ORG:${config.name};`,
          `TEL;type=CELL;type=VOICE;waid=${number}:+${number}`,
          "END:VCARD",
        ].join("\n"),
      };
    });

    await ctx.reply({ contacts: { displayName: config.owner, contacts } });
  },
});
