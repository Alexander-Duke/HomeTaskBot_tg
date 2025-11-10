import { Bot } from "grammy";

export function initBot(token, setupHandlers) {
  const bot = new Bot(token);

  setupHandlers(bot);

  // Ничего не запускаем (`bot.start()` нельзя в Workers)
  return bot;
}
