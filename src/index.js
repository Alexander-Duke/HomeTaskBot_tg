import { Telegraf } from 'telegraf';
import { google } from 'googleapis';

// Бот и Google создаются ЛЕНИВО, только один раз:
let botInstance = null;
let sheetsInstance = null;

function initGoogleSheets(keyJson) {
  const key = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function initBot(token, handlers) {
  const bot = new Telegraf(token);
  handlers(bot); // навешиваем команды и действия
  return bot;
}

// === ТВОЙ КОД ОБРАБОТЧИКОВ ПЕРЕНЕСЁН В ОТДЕЛЬНУЮ ФУНКЦИЮ ===
function setupBotHandlers(bot, sheets, SPREADSHEET_ID, SHEET_DATA, SHEET_USERS) {

  // (Здесь ничего не менялось — весь твой код getZones/getTasks/... остаётся)
  // Просто перенеси ВСЕ функции getZones, getTasks, markTaskAsDone, undoTask и т.д. сюда,
  // используй sheets/SPREADSHEET_ID/SHEET_DATA/SHEET_USERS из аргументов.

  // === Пример того, что меняется минимум: ===
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
          id: String(row[idCol] || i),        // строковый ID
          task: row[taskCol] || "Без названия",
          zone: row[zoneCol] || "Не указана",
          coef: parseFloat(row[coefCol]) || 0,
          created: created,
          status: status,
          rowIndex: i + 1 // реальный индекс строки в Google Sheets (1-based, включая заголовок)
        });
      }
      // Возвращаем только активные (status = false). Если хочешь видеть все — убери фильтр.
      const active = tasks.filter(t => !t.status);
      return active.sort((a, b) => a.coef - b.coef);
    } catch (err) {
      console.error("⚠️ Ошибка получения задач:", err);
      return [];
    }
  }

  // === Функция: отметить задачу как выполненную ===
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


  // === Функция: отменить выполнение задачи ===
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
  async function getTasksByZone(zone) {
    const allTasks = await getAllActiveTasks();
    if (zone === "ALL") return allTasks;
    return allTasks.filter(t => t.zone === zone);
  }
  // === START ===
  bot.start(async (ctx) => {
    const zones = await getZones();
    const buttons = zones.map(z => [{ text: z, callback_data: `zone_${z}` }]);
    buttons.push([{ text: "📋 Все задачи", callback_data: "zone_ALL" }]);
    await ctx.reply("Выберите зону:", { reply_markup: { inline_keyboard: buttons } });
  });
  // === Обработка /start с кнопками зон ===
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const zones = await getZones();

    const buttons = zones.map(z => [{ text: z, callback_data: `zone_${z}` }]);
    buttons.push([{ text: "📋 Все задачи", callback_data: "zone_ALL" }]);

    await bot.sendMessage(chatId, "Выберите зону:", {
      reply_markup: { inline_keyboard: buttons },
    });
  });

  // === Обработка нажатия на зону ===
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    // === 1️⃣ Обработка выбора зоны ===
    if (data.startsWith("zone_")) {
      const zone = data.replace("zone_", "");
      const tasks = await getTasksByZone(zone);
      if (tasks.length === 0) {
        await bot.sendMessage(chatId, `В зоне "${zone}" нет активных задач.`);
        return;
      }

      const today = new Date().toLocaleDateString("ru-RU");
      const buttons = tasks.map((t) => {
        const doneToday = t.created === today || t.coef >= 100;
        const label = doneToday ? `✅ ${t.task}` : t.task;
        return [{ text: label, callback_data: `task_${t.id}_${zone}_${doneToday ? "undo" : "done"}` }];
      });

      await bot.sendMessage(chatId, `📍 ${zone}\nВыберите задачу:`, {
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    // === 2️⃣ Обработка выбора задачи ===
    if (data.startsWith("task_")) {
      const parts = data.split("_");
      const taskId = parts[1];
      const zone = parts[2]; // добавили зону, чтобы знать, какие кнопки обновлять
      const action = parts[3];

      const userId = query.from.id;
      const executorName = await getExecutorNameByTelegramId(userId);

      let success = false;

      if (action === "done") {
        success = await markTaskAsDone(taskId, executorName);
        await bot.answerCallbackQuery(query.id, { text: success ? "Задача отмечена ✅" : "Ошибка при обновлении ❌" });
      } else if (action === "undo") {
        success = await undoTask(taskId);
        await bot.answerCallbackQuery(query.id, { text: success ? "Отмена выполнения 🔄" : "Не удалось отменить ❌" });
      }

      // === 3️⃣ После успешного действия обновляем кнопки ===
      if (success) {
        // Дадим Google Sheets 1 секунду на обновление данных
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
          const updatedTasks = await getTasksByZone(zone);
          const today = new Date().toLocaleDateString("ru-RU");

          const updatedButtons = updatedTasks.map((t) => {
            const doneToday = t.created === today || t.coef >= 100;
            const label = doneToday ? `✅ ${t.task}` : t.task;
            return [{ text: label, callback_data: `task_${t.id}_${zone}_${doneToday ? "undo" : "done"}` }];
          });

          await bot.editMessageReplyMarkup(
            { inline_keyboard: updatedButtons },
            { chat_id: chatId, message_id: messageId }
          );
        } catch (err) {
          // --- Вот эта часть добавлена ---
          // Telegram иногда возвращает 400 Bad Request, если кнопки не изменились.
          // Это не критично — просто пропускаем.
          if (
            err.response &&
            err.response.body &&
            err.response.body.description &&
            err.response.body.description.includes("message is not modified")
          ) {
            console.log("ℹ️ Пропущено обновление: message is not modified");
          } else {
            console.error("⚠️ Ошибка при обновлении кнопок:", err.message);
          }
        }
      }

    }
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
  
  // === И здесь продолжай вставлять ВСЕ остальные bot.action... ===
}

// === Точка входа для Cloudflare ===
export default {
  async fetch(request, env) {

    // ✅ Инициализируем Google Sheets (один раз)
    if (!sheetsInstance) {
      sheetsInstance = initGoogleSheets(env.GOOGLE_SERVICE_ACCOUNT_KEY);
    }

    // ✅ Инициализируем Бота (один раз)
    if (!botInstance) {
      botInstance = initBot(env.TELEGRAM_BOT_TOKEN, (bot) =>
        setupBotHandlers(bot, sheetsInstance, env.SPREADSHEET_ID, env.SHEET_DATA, env.SHEET_USERS)
      );
    }

    // Health-check
    if (request.method === 'GET') {
      return new Response('✅ Бот работает');
    }

    // Webhook обработчик Telegram
    if (request.method === 'POST') {
      try {
        await botInstance.handleUpdate(await request.json());
        return new Response('OK');
      } catch (err) {
        console.error('Ошибка обработки:', err);
        return new Response('Error', { status: 500 });
      }
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env) {
    console.log("⏰ Scheduled task executed");
  }
};
