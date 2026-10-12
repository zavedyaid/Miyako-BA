import { definePlugin } from "#lib/plugins";
import { api, ApiError } from "#lib/api";
import { listOf } from "#lib/extract";
import { truncate } from "#lib/utils";

// GET /ai/models → daftar model AI yang tersedia
export default definePlugin({
  name: "aimodels",
  aliases: ["models", "listai"],
  category: "ai",
  description: "Daftar model AI yang tersedia",
  async run({ ctx }) {
    const data = await api.get("/ai/models");
    const names = listOf(data)
      .map((m) => (typeof m === "string" ? m : (m?.id ?? m?.name ?? m?.model ?? m?.title)))
      .filter((n) => typeof n === "string" && n.trim());
    if (!names.length) throw new ApiError("Daftar model kosong.");

    await ctx.reply(truncate(["*🤖 DAFTAR MODEL AI*", ...names.map((n, i) => `${i + 1}. ${n}`)].join("\n"), 3800), {
      preview: { title: "Model AI", body: `${names.length} model` },
    });
  },
});
