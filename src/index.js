import { initBot } from './bot.js';
import { setupBotHandlers } from './handlers.js';

let botInstance = null;

export default {
  async fetch(request, env) {
    try {
      if (!botInstance) {
        botInstance = initBot(env.TELEGRAM_BOT_TOKEN, (bot) =>
          setupBotHandlers(bot, env)
        );
      }

      if (request.method === "GET") {
        return new Response("✅ Бот работает");
      }

      if (request.method === "POST") {
        const update = await request.json();
        try {
          await botInstance.handleUpdate(await request.json());
        } catch (err) {
          console.error("🔴 Telegram handler error:", err);
        }

        return new Response("OK");
      }

      return new Response("Not found", { status: 404 });

    } catch (err) {
      console.error("🔥 Runtime Error:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
};
