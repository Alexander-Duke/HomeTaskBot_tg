import { initBot } from './bot.js';
import { setupBotHandlers } from './handlers.js';

let botInstance = null;

export default {
  async fetch(request, env) {
    try {
      // === Инициализация бота один раз ===
      if (!botInstance) {
        botInstance = initBot(env.TELEGRAM_BOT_TOKEN, (bot) => 
          setupBotHandlers(bot, env)
        );
      }

      // === Health-check / browser check ===
      if (request.method === 'GET') {
        return new Response('✅ Бот запущен и ожидает webhook');
      }

      // === Обработка входящего webhook от Telegram ===
      if (request.method === 'POST') {
        const update = await request.json();
        await botInstance.handleUpdate(update);
        return new Response('OK');
      }

      return new Response('Not found', { status: 404 });

    } catch (err) {
      console.error("🔥 Runtime error:", err);
      return new Response("Internal error", { status: 500 });
    }
  }
};
