import { initBot } from './bot';
import { initGoogleSheets } from './sheets';
import { setupBotHandlers } from './handlers';

let botInstance = null;
let sheetsInstance = null;

export default {
  async fetch(request, env) {

    if (!sheetsInstance) {
      sheetsInstance = initGoogleSheets(env.GOOGLE_SERVICE_ACCOUNT_KEY);
    }

    if (!botInstance) {
      botInstance = initBot(env.TELEGRAM_BOT_TOKEN, (bot) =>
        setupBotHandlers(
          bot,
          sheetsInstance,
          env.SPREADSHEET_ID,
          env.SHEET_DATA,
          env.SHEET_USERS
        )
      );
    }

    if (request.method === 'GET') {
      return new Response('✅ Бот работает');
    }

    if (request.method === 'POST') {
      await botInstance.handleUpdate(await request.json());
      return new Response('OK');
    }

    return new Response('Not Found', { status: 404 });
  }
};
