// bot.js — Telegram-бот для домашних задач (общие задачи)
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const { google } = require("googleapis");

// === Конфигурация ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SPREADSHEET_ID = "1wJy1r75VXJGiKdD3fqSGCVVcVifzTB8nClv4tyEsv90";
const SHEET_DATA = "Data";
const SHEET_USERS = "Users";
const SHEET_LOG = "Log";

if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN не задан в Secrets");
  process.exit(1);
}

// === Аутентификация Google Sheets ===
let auth;
let sheets;

try {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheets = google.sheets({ version: "v4", auth });
  console.log("✅ Google Sheets: аутентификация успешна");
} catch (err) {
  console.error("❌ Ошибка Google Sheets:", err.message);
  process.exit(1);
}

// === Вспомогательные функции ===

async function getExecutorNameByTelegramId(userId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!A:E`,
    });
    const rows = response.data.values || [];
    for (let i = 1; i < rows.length; i++) {
      const telegramId = rows[i][0];
      const executorName = rows[i][3]; // колонка D — "Исполнитель"
      const isActive = rows[i][4];
      const active = isActive === true || isActive === "TRUE" || isActive === "true" || isActive === 1;
      if (String(telegramId) === String(userId) && active) {
        return executorName || "Не указано";
      }
    }
  } catch (err) {
    console.error("⚠️ Ошибка получения имени исполнителя:", err.message);
  }
  return "Неизвестный пользователь";
}

// === Функция: получить все активные задачи (с поддержкой процентов) ===
async function getAllActiveTasks() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!A:O`,
    });
    const rows = response.data.values || [];
    if (rows.length < 2) return [];

    const headers = rows[0];
    const idCol = headers.indexOf("ID");
    const taskCol = headers.indexOf("Задача");
    const zoneCol = headers.indexOf("Зона");
    const statusCol = headers.indexOf("Статус");
    const coefCol = headers.indexOf("Коэф_чистоты");

    const tasks = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const status = row[statusCol] === "TRUE" || row[statusCol] === true;
      if (!status) {
        tasks.push({
          id: String(row[idCol] || i), // приводим к строке для сравнения
          task: row[taskCol] || "Без названия",
          zone: row[zoneCol] || "Не указана",
          coef: parseFloat(row[coefCol]) || 0, // ожидаем 0–100
        });
      }
    }
    // Сортировка: чем ниже процент — тем срочнее
    return tasks.sort((a, b) => a.coef - b.coef);
  } catch (err) {
    console.error("⚠️ Ошибка получения задач:", err.message);
    return [];
  }
}

// === Функция: отметить задачу как выполненную ===
async function markTaskAsDone(taskId, executorName) {
  try {
    // === 1. Получаем заголовки ===
    const headersResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!A1:O1`,
    });
    const headers = (headersResponse.data.values && headersResponse.data.values[0]) || [];

    const idCol = headers.indexOf("ID");
    const taskCol = headers.indexOf("Задача");
    const zoneCol = headers.indexOf("Зона");
    const freqCol = headers.indexOf("Регулярность");
    const statusCol = headers.indexOf("Статус");
    const createdCol = headers.indexOf("Created");
    const dueCol = headers.indexOf("Срок");
    const daysLeftCol = headers.indexOf("Дней до срока");
    const coefCol = headers.indexOf("Коэф_чистоты");
    const execCol = headers.indexOf("Исполнитель");
    const doneDateCol = headers.indexOf("Дата выполнения");

    // Проверка наличия всех колонок
    const requiredCols = { idCol, taskCol, zoneCol, freqCol, statusCol, createdCol, dueCol, execCol, doneDateCol };
    for (const [name, idx] of Object.entries(requiredCols)) {
      if (idx === -1) {
        console.error(`❌ Отсутствует колонка: ${name}`);
        return false;
      }
    }

    // === 2. Получаем все данные ===
    const dataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!A:O`,
    });
    const rows = dataResponse.data.values || [];

    // === 3. Находим задачу по ID ===
    let taskRow = null;
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idCol] || "") === String(taskId)) {
        taskRow = rows[i];
        rowIndex = i + 1; // Google Sheets: строки с 1
        break;
      }
    }

    if (!taskRow || rowIndex === -1) {
      console.error(`❌ Задача с ID=${taskId} не найдена`);
      return false;
    }

    // === 4. Обновляем текущую задачу как выполненную ===
    const today = new Date();
    const todayStr = today.toLocaleDateString("ru-RU"); // ДД.ММ.ГГГГ

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!${String.fromCharCode(65 + statusCol)}${rowIndex}`,
      valueInputOption: "RAW",
      resource: { values: [["TRUE"]] },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!${String.fromCharCode(65 + execCol)}${rowIndex}`,
      valueInputOption: "RAW",
      resource: { values: [[executorName]] },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!${String.fromCharCode(65 + doneDateCol)}${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[todayStr]] },
    });


    // === 5. Создаём новую запись для следующего цикла ===
    const taskText = taskRow[taskCol] || "";
    const zoneText = taskRow[zoneCol] || "";
    const frequency = parseInt(taskRow[freqCol]) || 7;

    const newCreated = todayStr;
    const newDueDate = new Date(today);
    newDueDate.setDate(today.getDate() + frequency);
    const newDueStr = newDueDate.toLocaleDateString("ru-RU");

    // Новый ID = номер следующей строки
    const newId = rows.length;

    // Формируем новую строку
    const newRow = Array(headers.length).fill("");

    newRow[idCol] = newId;
    newRow[taskCol] = taskText;
    newRow[zoneCol] = zoneText;
    newRow[freqCol] = frequency;
    newRow[statusCol] = "FALSE";
    newRow[createdCol] = newCreated;
    newRow[dueCol] = newDueStr;

    // 🔹 ВСТАВЛЯЕМ ФОРМУЛЫ КАК СТРОКИ (начинаются с '=')
    // Дней до срока = МАКС(0; G - СЕГОДНЯ())
    newRow[daysLeftCol] = `=МАКС(0; ${String.fromCharCode(65 + dueCol)}${newId + 1} - СЕГОДНЯ())`;

    // Коэф_чистоты = (H / D) * 100
    newRow[coefCol] = `=ЕСЛИ(${String.fromCharCode(65 + freqCol)}${newId + 1}>0; (${String.fromCharCode(65 + daysLeftCol)}${newId + 1}/${String.fromCharCode(65 + freqCol)}${newId + 1})*100; "")`;

    // Остальные поля — пусто
    newRow[execCol] = "";
    newRow[doneDateCol] = "";

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!A:O`,
      valueInputOption: "USER_ENTERED", // ← важно! чтобы Google распознал формулы
      resource: { values: [newRow] },
    });

    console.log(`✅ Задача ID=${taskId} выполнена. Создана новая запись ID=${newId}`);
    return true;
  } catch (err) {
    console.error("⚠️ Ошибка в markTaskAsDone:", err.message);
    return false;
  }
}

// === Telegram-бот ===
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

bot.on("polling_error", (err) => {
  console.error("❌ Polling error:", err.message);
});

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "друг";
  bot.sendMessage(
    chatId,
    `Привет, ${firstName}! 👋\nИспользуй:\n/tasks — все задачи\n/zones — по зонам\n/done — отметить выполнение`
  );
});

bot.onText(/\/tasks/, async (msg) => {
  const chatId = msg.chat.id;
  const tasks = await getAllActiveTasks();

  if (tasks.length === 0) {
    bot.sendMessage(chatId, "✅ Нет активных задач!");
    return;
  }

  let text = "🧹 <b>Все активные задачи (по срочности):</b>\n\n";
  tasks.slice(0, 20).forEach((t, i) => {
    const urgency = t.coef < 0.3 ? "🔴" : t.coef < 0.7 ? "🟡" : "🟢";
    text += `${urgency} ${i + 1}. ${t.task}\n   📍 ${t.zone} (коэф. ${t.coef.toFixed(2)})\n\n`;
  });

  bot.sendMessage(chatId, text, { parse_mode: "HTML" });
});

bot.onText(/\/zones/, async (msg) => {
  const chatId = msg.chat.id;
  const tasks = await getAllActiveTasks();

  if (tasks.length === 0) {
    bot.sendMessage(chatId, "✅ Нет активных задач!");
    return;
  }

  const zones = {};
  tasks.forEach(t => {
    if (!zones[t.zone]) zones[t.zone] = [];
    zones[t.zone].push(t);
  });

  let text = "🧩 <b>Задачи по зонам:</b>\n\n";
  for (const [zone, zoneTasks] of Object.entries(zones)) {
    text += `📍 <b>${zone}</b>\n`;
    zoneTasks.forEach(t => {
      const urgency = t.coef < 0.3 ? "🔴" : "🟢";
      text += `  ${urgency} ${t.task} (${t.coef.toFixed(2)})\n`;
    });
    text += "\n";
  }

  bot.sendMessage(chatId, text, { parse_mode: "HTML" });
});

bot.onText(/\/done/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const executorName = await getExecutorNameByTelegramId(userId);
  const tasks = await getAllActiveTasks();

  if (tasks.length === 0) {
    bot.sendMessage(chatId, "✅ Нет задач для отметки!");
    return;
  }

  let text = "✅ Выберите задачу для отметки:\n\n";
  tasks.slice(0, 10).forEach((t, i) => {
    const urgency = t.coef < 30 ? "🔴" : t.coef < 70 ? "🟡" : "🟢";
    text += `${i + 1}. ${t.task} (${t.zone}) — ${t.coef}%\n`;
  });
  text += "\nОтправьте номер задачи (например, «1»).";

  const sent = await bot.sendMessage(chatId, text);

  const replyHandler = async (replyMsg) => {
    if (replyMsg.from.id !== userId) return;
    const num = parseInt(replyMsg.text);
    if (num >= 1 && num <= tasks.length) {
      const task = tasks[num - 1];
      const success = await markTaskAsDone(task.id, executorName);
      if (success) {
        bot.sendMessage(chatId, `✅ Задача «${task.task}» отмечена как выполненная!\nИсполнитель: ${executorName}`);
      } else {
        bot.sendMessage(chatId, "❌ Не удалось обновить задачу. Проверьте ID в таблице.");
      }
      bot.removeListener("message", replyHandler);
    }
  };

  bot.on("message", replyHandler);
});

// === Express-сервер для UptimeRobot ===
const app = express();
app.get("/", (req, res) => {
  res.send("✅ Бот работает. Сервер активен.");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Express сервер запущен на порту ${PORT}`);
});