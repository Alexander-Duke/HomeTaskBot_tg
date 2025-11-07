import { Telegraf } from 'telegraf';

export function initBot(token, setupHandlers) {
  const bot = new Telegraf(token);
  setupHandlers(bot);
  return bot;
}
