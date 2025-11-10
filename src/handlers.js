import {
  getZones,
  getTasksByZone,
  getExecutorNameByTelegramId,
  markTaskAsDone,
  undoTask,
  getAllActiveTasks
} from "./sheets.js";

export function setupBotHandlers(bot, env) {

  bot.command("start", async (ctx) => {
    await ctx.reply("👋 Бот запущен! Переезд в Cloudflare Workers идет успешно.");
  });

  // позже добавим остальное…
}


