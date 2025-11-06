import { Telegraf } from 'telegraf';
import { google } from 'googleapis';

// === Конфигурация (берётся из Wrangler secrets) ===
const TELEGRAM_TOKEN = TELEGRAM_BOT_TOKEN;
const SPREADSHEET_ID = "1wJy1r75VXJGiKdD3fqSGCVVcVifzTB8nClv4tyEsv90";
const SHEET_DATA = "Data";
const SHEET_USERS = "Users";

if (!TELEGRAM_TOKEN) {
  throw new Error("❌ TELEGRAM_BOT_TOKEN не задан в Secrets");
}

// === Инициализация Google Sheets ===
let sheets;
try {
  const key = JSON.parse(GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheets = google.sheets({ version: "v4", auth });
} catch (err) {
  console.error("❌ Ошибка Google Sheets:", err.message);
  throw err;
}

// === Вспомогательные функции (сохранены без изменений) ===
async function getExecutorNameByTelegramId(userId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!A:E`,
    });
    const rows = response.data.values || [];
    for (let i = 1; i < rows.length; i++) {
      const telegramId = rows[i][0];
      const executorName = rows[i][3];
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

async function getAllActiveTasks() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!A:Z`,
    });
    const rows = response.data.values || [];
    if (rows.length < 2) return [];

    const headers = rows[0];
    const idCol = headers.indexOf("ID");
    const taskCol = headers.indexOf("Задача");
    const zoneCol = headers.indexOf("Зона");
    const statusCol = headers.indexOf("Статус");
    const coefCol = headers.indexOf("Коэф_чистоты");
    const createdCol = headers.indexOf("Created");

    const tasks = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const status = String(row[statusCol] || "").toUpperCase() === "TRUE";
      const created = row[createdCol] || "";
      tasks.push({
        id: String(row[idCol] || i),
        task: row[taskCol] || "Без названия",
        zone: row[zoneCol] || "Не указана",
        coef: parseFloat(row[coefCol]) || 0,
        created: created,
        status: status,
        rowIndex: i + 1
      });
    }
    const active = tasks.filter(t => !t.status);
    return active.sort((a, b) => a.coef - b.coef);
  } catch (err) {
    console.error("⚠️ Ошибка получения задач:", err);
    return [];
  }
}

async function getZones() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_DATA}!A:P`,
  });
  const rows = response.data.values || [];
  const headers = rows[0] || [];
  const zoneCol = headers.indexOf("Зона");
  const statusCol = headers.indexOf("Статус");
  const createdCol = headers.indexOf("Created");
  if (zoneCol === -1) return [];

  const zones = new Set();
  const today = new Date().toLocaleDateString("ru-RU");

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const zone = row[zoneCol] || "Без зоны";
    const created = row[createdCol];
    const doneToday = created === today && (row[statusCol] === "TRUE");
    if (!doneToday) zones.add(zone);
  }
  return [...zones];
}

async function getTasksByZone(zone) {
  const allTasks = await getAllActiveTasks();
  if (zone === "ALL") return allTasks;
  return allTasks.filter(t => t.zone === zone);
}

// === Функции работы с задачами (сохранены без изменений) ===
async function markTaskAsDone(taskId, executorName) {
  try {
    console.log("=== markTaskAsDone start ===", taskId, executorName);

    // 1) Заголовки (широкий диапазон)
    const hdrResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!A1:Z1`,
    });
    const headers = (hdrResp.data.values && hdrResp.data.values[0]) || [];
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
    const parentIdCol = headers.indexOf("ParentID");

    if (idCol === -1 || taskCol === -1 || statusCol === -1 || execCol === -1 || parentIdCol === -1) {
      console.error("❌ markTaskAsDone: отсутствуют необходимые колонки");
      return false;
    }

    // 2) Считаем все строки
    const dataResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!A:Z`,
    });
    const rows = dataResp.data.values || [];

    // 3) Найдем исходную строку
    let parentArrayIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idCol]) === String(taskId)) {
        parentArrayIndex = i;
        break;
      }
    }
    if (parentArrayIndex === -1) {
      console.error("❌ markTaskAsDone: родительская задача не найдена (ID=" + taskId + ")");
      return false;
    }
    const parentSheetRow = parentArrayIndex + 1;
    console.log("Parent found at array index", parentArrayIndex, "sheet row", parentSheetRow);

    // 4) Обновим родителя: Статус = TRUE, Исполнитель, Дата выполнения
    const today = new Date();
    const todayStr = today.toLocaleDateString("ru-RU");
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!${String.fromCharCode(65 + statusCol)}${parentSheetRow}`,
      valueInputOption: "RAW",
      resource: { values: [["TRUE"]] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!${String.fromCharCode(65 + execCol)}${parentSheetRow}`,
      valueInputOption: "RAW",
      resource: { values: [[executorName]] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!${String.fromCharCode(65 + doneDateCol)}${parentSheetRow}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[todayStr]] },
    });

    // 5) Подготовим новую (дочернюю) строку
    const originalRow = rows[parentArrayIndex];
    const newId = `=${rows.length + 1}-1`; // уникальный ID как строка
    const frequency = parseInt(originalRow[freqCol]) || 7;
    const newCreated = todayStr;
    const newDueDate = new Date(today);
    newDueDate.setDate(today.getDate() + frequency);
    const newDueStr = newDueDate.toLocaleDateString("ru-RU");

    const newRow = Array(Math.max(headers.length, 16)).fill(""); // запас
    newRow[idCol] = newId;
    newRow[taskCol] = originalRow[taskCol] || "";
    newRow[zoneCol] = originalRow[zoneCol] || "";
    if (freqCol !== -1) newRow[freqCol] = frequency;
    if (statusCol !== -1) newRow[statusCol] = "FALSE";
    if (createdCol !== -1) newRow[createdCol] = newCreated;
    if (dueCol !== -1) newRow[dueCol] = newDueStr;
    if (daysLeftCol !== -1) newRow[daysLeftCol] = `=МАКС(0; ${String.fromCharCode(65 + dueCol)}${rows.length+1} - СЕГОДНЯ())`;
    if (coefCol !== -1) newRow[coefCol] = `=ЕСЛИ(${String.fromCharCode(65 + freqCol)}${rows.length+1}>0; (${String.fromCharCode(65 + daysLeftCol)}${rows.length+1}/${String.fromCharCode(65 + freqCol)}${rows.length+1})*100; "")`;
    if (execCol !== -1) newRow[execCol] = "";
    if (doneDateCol !== -1) newRow[doneDateCol] = "";
    if (parentIdCol !== -1) newRow[parentIdCol] = String(taskId); // <- важно

    // 6) Добавляем новую строку
    const appendResp = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!A:Z`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [newRow] },
    });
    console.log("appendResp keys:", appendResp && appendResp.status ? appendResp.status : "no-status");

    // 7) Подтвердим, что дочерняя строка создана: перечитаем лист и найдем ParentID == taskId и Created == today
    const afterResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!A:Z`,
    });
    const rowsAfter = afterResp.data.values || [];
    let foundChild = null;
    for (let i = 1; i < rowsAfter.length; i++) {
      const p = rowsAfter[i][parentIdCol];
      const c = rowsAfter[i][createdCol];
      if (String(p) === String(taskId) && String(c) === String(newCreated)) {
        foundChild = { arrayIndex: i, sheetRow: i + 1, row: rowsAfter[i] };
        break;
      }
    }
    if (foundChild) {
      console.log("✅ Child created at sheet row", foundChild.sheetRow, "with ParentID =", foundChild.row[parentIdCol], "and ID =", foundChild.row[idCol]);
    } else {
      console.warn("⚠️ Child not found after append. Dump of last rows:", rowsAfter.slice(-5));
    }

    return true;
  } catch (err) {
    console.error("⚠️ Ошибка в markTaskAsDone:", err && err.message ? err.message : err);
    if (err && err.response && err.response.data) console.error("API error:", JSON.stringify(err.response.data));
    return false;
  }
}

async function undoTask(taskId) {
  try {
    console.log("=== DEBUG undoTask start ===", taskId);

    // 1) Получаем метаданные (sheetId)
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheetMeta = meta.data.sheets.find(s => s.properties && s.properties.title === SHEET_DATA);
    if (!sheetMeta) {
      console.error("❌ Лист", SHEET_DATA, "не найден");
      return false;
    }
    const sheetIdNum = sheetMeta.properties.sheetId;
    console.log("sheetIdNum =", sheetIdNum);

    // 2) Загружаем все значения (широкий диапазон)
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!A:Z`,
    });
    const rows = resp.data.values || [];
    if (rows.length < 2) {
      console.error("❌ Лист пуст или только заголовки");
      return false;
    }

    // 3) Заголовки и индексы колонок
    const headers = rows[0].map(h => String(h));
    console.log("Headers:", headers.join(" | "));
    const idCol = headers.indexOf("ID");
    const parentIdCol = headers.indexOf("ParentID");
    const statusCol = headers.indexOf("Статус");
    const execCol = headers.indexOf("Исполнитель");
    const doneDateCol = headers.indexOf("Дата выполнения");

    console.log("Cols idx -> ID:", idCol, "ParentID:", parentIdCol, "Status:", statusCol);

    if (idCol === -1 || parentIdCol === -1) {
      console.error("❌ Не найдены колонки ID или ParentID");
      return false;
    }

    // 4) Найти текущую строку (по taskId)
    let currentArrayIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idCol]) === String(taskId)) {
        currentArrayIndex = i;
        break;
      }
    }
    if (currentArrayIndex === -1) {
      console.warn("⚠️ Текущая задача (по taskId) не найдена в массиве rows");
      // выведем последние 10 строк для диагностики
      console.log("Last rows (for debug):", rows.slice(-10));
      return false;
    }

    const currentRow = rows[currentArrayIndex];
    const sheetRow = currentArrayIndex + 1;
    console.log("Current row array index:", currentArrayIndex, "-> sheet row:", sheetRow);
    console.log("Current row sample:", currentRow.slice(0, Math.min(currentRow.length, 20)));

    const parentIdVal = currentRow[parentIdCol];
    console.log("Value in ParentID cell for current row:", parentIdVal, " (type:", typeof parentIdVal, ")");

    // 5) Выведем небольшой срез колонок ParentID сверху и снизу, чтобы увидеть формат
    const parentColValues = [];
    for (let i = 1; i < rows.length; i++) {
      parentColValues.push(String(rows[i][parentIdCol] || ""));
    }
    console.log("ParentID column sample (first 20):", parentColValues.slice(0, 20));
    console.log("ParentID column sample (last 20):", parentColValues.slice(-20));

    // 6) Проверим: если у текущей строки есть ParentID -> это дочерняя запись
    if (parentIdVal && String(parentIdVal).trim() !== "") {
      console.log("🧩 Текущая запись имеет ParentID -> считаем её дочерней. ParentID =", String(parentIdVal));

      // Найдём родителя в колонке ID
      let parentArrayIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][idCol]) === String(parentIdVal)) {
          parentArrayIndex = i;
          break;
        }
      }

      if (parentArrayIndex === -1) {
        console.warn("⚠️ Родитель не найден по ParentID в таблице. ParentID=", String(parentIdVal));
        return false;
      }
      const parentSheetRow = parentArrayIndex + 1;
      console.log("Parent found at array index", parentArrayIndex, "-> sheet row", parentSheetRow);

      // 7) Удаляем дочернюю строку (current)
      console.log("Попытка удаления дочерней строки (sheetRow):", sheetRow);
      const deleteResp = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: sheetIdNum,
                  dimension: "ROWS",
                  startIndex: sheetRow - 1,
                  endIndex: sheetRow
                }
              }
            }
          ]
        }
      });
      console.log("batchUpdate delete response keys:", deleteResp && deleteResp.status ? deleteResp.status : "no-status");

      // 8) Подтверждение удаления — перечитаем лист
      const after = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_DATA}!A:Z` });
      const rowsAfter = after.data.values || [];
      let stillExists = false;
      for (let i = 1; i < rowsAfter.length; i++) {
        if (String(rowsAfter[i][parentIdCol]) === String(parentIdVal) && String(rowsAfter[i][idCol]) === String(taskId)) {
          stillExists = true;
          console.log("❗ После удаления дочерняя запись всё ещё есть (row):", i+1);
          break;
        }
      }
      if (stillExists) {
        console.error("❌ Дочерняя запись не удалена — проверь sheetId и права доступа.");
        return false;
      }
      console.log("✅ Дочерняя запись удалена успешно (или была единственной).");

      // 9) Восстановим родителя: Статус=FALSE, Исполнитель="", Дата выполнения=""
      const updates = [];
      if (statusCol !== -1) updates.push({ range: `${SHEET_DATA}!${String.fromCharCode(65 + statusCol)}${parentSheetRow}`, values: [["FALSE"]] });
      if (execCol !== -1) updates.push({ range: `${SHEET_DATA}!${String.fromCharCode(65 + execCol)}${parentSheetRow}`, values: [[""]] });
      if (doneDateCol !== -1) updates.push({ range: `${SHEET_DATA}!${String.fromCharCode(65 + doneDateCol)}${parentSheetRow}`, values: [[""]] });

      if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: { valueInputOption: "USER_ENTERED", data: updates }
        });
        console.log("🔄 Родитель обновлён: статус/исполнитель/дата очищены");
      } else {
        console.warn("⚠️ Нечего обновлять у родителя (нет колонок)");
      }

      return true;
    } else {
      // Если текущая строка не имеет ParentID — возможно, пользователь нажал родительскую строку.
      console.log("ℹ️ Текущая строка не имеет ParentID. Это родительская запись или неподходящий элемент.");
      // --- для отладки - выведем дочерние записи, если они есть
      const children = [];
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][parentIdCol]) === String(taskId)) children.push({ arrayIndex: i, sheetRow: i+1, id: rows[i][idCol] });
      }
      console.log("Найдены дочерние записи для текущего ID (если есть):", children.slice(0, 20));
      return false;
    }
  } catch (err) {
    console.error("⚠️ DEBUG: Ошибка в undoTask:", err && (err.message || err));
    if (err && err.response && err.response.data) console.error("API response:", JSON.stringify(err.response.data));
    return false;
  }
}

// === Инициализация бота ===
const bot = new Telegraf(TELEGRAM_TOKEN);

// Обработка /start
bot.start(async (ctx) => {
  const zones = await getZones();
  const buttons = zones.map(z => [{ text: z, callback_data: `zone_${z}` }]);
  buttons.push([{ text: "📋 Все задачи", callback_data: "zone_ALL" }]);

  await ctx.reply("Выберите зону:", {
    reply_markup: { inline_keyboard: buttons }
  });
});

// Обработка callback-запросов
bot.action(/.*/, async (ctx) => {
  const data = ctx.callbackQuery.data;

  // Выбор зоны
  if (data.startsWith("zone_")) {
    const zone = data.replace("zone_", "");
    const tasks = await getTasksByZone(zone);

    if (tasks.length === 0) {
      await ctx.reply(`В зоне "${zone}" нет активных задач.`);
      return;
    }

    const today = new Date().toLocaleDateString("ru-RU");
    const buttons = tasks.map((t) => {
      const doneToday = t.created === today || t.coef >= 100;
      const label = doneToday ? `✅ ${t.task}` : t.task;
      return [{ text: label, callback_data: `task_${t.id}_${zone}_${doneToday ? "undo" : "done"}` }];
    });

    await ctx.reply(`📍 ${zone}\nВыберите задачу:`, {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  // Выбор задачи
  if (data.startsWith("task_")) {
    const parts = data.split("_");
    const taskId = parts[1];
    const zone = parts[2];
    const action = parts[3];

    const userId = ctx.from.id;
    const executorName = await getExecutorNameByTelegramId(userId);
    let success = false;

    if (action === "done") {
      success = await markTaskAsDone(taskId, executorName);
      await ctx.answerCbQuery(success ? "Задача отмечена ✅" : "Ошибка при обновлении ❌");
    } else if (action === "undo") {
      success = await undoTask(taskId);
      await ctx.answerCbQuery(success ? "Отмена выполнения 🔄" : "Не удалось отменить ❌");
    }

    // Обновление кнопок после действия
    if (success) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const updatedTasks = await getTasksByZone(zone);
        const today = new Date().toLocaleDateString("ru-RU");
        const updatedButtons = updatedTasks.map((t) => {
          const doneToday = t.created === today || t.coef >= 100;
          const label = doneToday ? `✅ ${t.task}` : t.task;
          return [{ text: label, callback_data: `task_${t.id}_${zone}_${doneToday ? "undo" : "done"}` }];
        });

        await ctx.editMessageReplyMarkup({
          inline_keyboard: updatedButtons
        });
      } catch (err) {
        if (!err.message.includes("message is not modified")) {
          console.error("⚠️ Ошибка обновления кнопок:", err.message);
        }
      }
    }
  }
});

// === Экспорт для Cloudflare Workers ===
export default {
  async fetch(request, env) {
    // Сохраняем переменные окружения в глобальные для доступа из функций
    global.TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
    global.GOOGLE_SERVICE_ACCOUNT_KEY = env.GOOGLE_SERVICE_ACCOUNT_KEY;

    // Health-check для UptimeRobot
    if (request.method === 'GET') {
      return new Response('✅ Бот работает. Сервер активен.');
    }

    // Обработка webhook от Telegram
    if (request.method === 'POST') {
      try {
        await bot.handleUpdate(await request.json());
        return new Response('OK');
      } catch (err) {
        console.error('Ошибка обработки:', err);
        return new Response('Error', { status: 500 });
      }
    }

    return new Response('Not Found', { status: 404 });
  },

  // Ежедневный триггер (опционально)
  async scheduled(event, env) {
    console.log('Запуск ежедневных задач');
    // Здесь можно добавить логику ежедневного обновления коэффициентов
  }
};