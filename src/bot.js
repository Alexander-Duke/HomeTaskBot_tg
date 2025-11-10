import { Telegraf } from 'telegraf';

export function initBot(token, setupHandlers) {
  const bot = new Telegraf(token, {
    webhookReply: true // важно для скорости
  });

  setupHandlers(bot);

  // На Cloudflare Workers мы НЕ запускаем bot.launch()
  // У нас нет сервера — входящие запросы идут в index.js → bot.handleUpdate()

  return bot;
}
