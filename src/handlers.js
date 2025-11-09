import {
  getZones,
  getTasksByZone,
  getExecutorNameByTelegramId,
  markTaskAsDone,
  undoTask,
  getAllActiveTasks
} from "./sheets.js";

export function setupBotHandlers(bot, env, SHEET_DATA, SHEET_USERS) {

  // === Обработка выбора зоны ===
  bot.action(/zone_(.+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const zone = ctx.match[1];
    const tasks = await getTasksByZone(sheets, SPREADSHEET_ID, SHEET_DATA, zone);

    if (tasks.length === 0) {
      return ctx.reply(`В зоне "${zone}" нет активных задач.`);
    }

    const today = new Date().toLocaleDateString("ru-RU");
    const buttons = tasks.map((t) => {
      const doneToday = t.created === today || t.coef >= 100;
      const label = doneToday ? `✅ ${t.task}` : t.task;
      return [{ text: label, callback_data: `task_${t.id}_${zone}_${doneToday ? "undo" : "done"}` }];
    });

    return ctx.reply(`📍 ${zone}\nВыберите задачу:`, {
      reply_markup: { inline_keyboard: buttons }
    });
  });

  // === Обработка выполнения / отмены ===
  bot.action(/task_(.+)_(.+)_(done|undo)/, async (ctx) => {
    const [, taskId, zone, action] = ctx.match;
    const userId = ctx.from.id;
    const executorName = await getExecutorNameByTelegramId(sheets, SPREADSHEET_ID, SHEET_USERS, userId);

    const success =
      action === "done"
        ? await markTaskAsDone(sheets, SPREADSHEET_ID, SHEET_DATA, taskId, executorName)
        : await undoTask(sheets, SPREADSHEET_ID, SHEET_DATA, taskId);

    await ctx.answerCbQuery(success ? "Готово ✅" : "Ошибка ❌");
    if (!success) return;

    await new Promise(res => setTimeout(res, 1000));

    const updated = await getTasksByZone(sheets, SPREADSHEET_ID, SHEET_DATA, zone);
    const today = new Date().toLocaleDateString("ru-RU");

    const updatedButtons = updated.map((t) => {
      const doneToday = t.created === today || t.coef >= 100;
      return [{ text: doneToday ? `✅ ${t.task}` : t.task, callback_data: `task_${t.id}_${zone}_${doneToday ? "undo" : "done"}` }];
    });

    await ctx.editMessageReplyMarkup({ inline_keyboard: updatedButtons }).catch(() => {});
  });

  // === Команда /tasks ===
  bot.command("tasks", async (ctx) => {
    const tasks = await getAllActiveTasks(sheets, SPREADSHEET_ID, SHEET_DATA);
    if (tasks.length === 0) return ctx.reply("✅ Нет активных задач!");

    let text = "🧹 <b>Все активные задачи (по срочности):</b>\n\n";
    tasks.slice(0, 20).forEach((t, i) => {
      const urgency = t.coef < 0.3 ? "🔴" : t.coef < 0.7 ? "🟡" : "🟢";
      text += `${urgency} ${i + 1}. ${t.task}\n   📍 ${t.zone} (коэф. ${t.coef.toFixed(2)})\n\n`;
    });

    ctx.reply(text, { parse_mode: "HTML" });
  });
}

// === ВАЖНО ===
// Убедись, что в env есть:
// GOOGLE_SERVICE_KEY_BASE64  (зашифрованный JSON сервис-аккаунта)

// Получаем access_token для Google Sheets API
async function getAccessToken(env) {
  const keyJson = JSON.parse(atob(env.GOOGLE_SERVICE_KEY_BASE64));

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: keyJson.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  function base64url(input) {
    return btoa(JSON.stringify(input))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  const unsigned = `${base64url(header)}.${base64url(claims)}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(keyJson.private_key.replace(/-----[^-]+-----/g, "").replace(/\n/g, "")), c => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );

  const signedJwt = `${unsigned}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`
  });

  const data = await resp.json();
  return data.access_token;
}

// ===== ГЛАВНАЯ ФУНКЦИЯ =====

export async function markTaskAsDone(taskId, executorName, env) {
  const accessToken = await getAccessToken(env);

  // 1) Заголовки
  const hdr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${env.SHEET_DATA}!A1:Z1`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then(r => r.json());

  const headers = hdr.values[0];
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

  // 2) Считываем весь лист
  const data = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${env.SHEET_DATA}!A:Z`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then(r => r.json());
  const rows = data.values;

  // 3) Ищем строку родителя
  let parentIndex = rows.findIndex((r, i) => i > 0 && String(r[idCol]) === String(taskId));
  if (parentIndex === -1) return false;
  const parentSheetRow = parentIndex + 1;

  // 4) Помечаем выполненным
  const todayStr = new Date().toLocaleDateString("ru-RU");

  async function updateCell(col, row, value, user = false) {
    return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${env.SHEET_DATA}!${String.fromCharCode(65 + col)}${row}?valueInputOption=${user ? "USER_ENTERED" : "RAW"}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [[value]] })
    });
  }

  await updateCell(statusCol, parentSheetRow, "TRUE");
  await updateCell(execCol, parentSheetRow, executorName);
  await updateCell(doneDateCol, parentSheetRow, todayStr, true);

  // 5) Создаем новую строку
  const original = rows[parentIndex];
  const frequency = parseInt(original[freqCol]) || 7;

  const newDue = new Date();
  newDue.setDate(newDue.getDate() + frequency);
  const newDueStr = newDue.toLocaleDateString("ru-RU");

  const newRow = Array(headers.length).fill("");
  newRow[idCol] = `=${rows.length}-1`;
  newRow[taskCol] = original[taskCol];
  newRow[zoneCol] = original[zoneCol];
  newRow[freqCol] = frequency;
  newRow[statusCol] = "FALSE";
  newRow[createdCol] = todayStr;
  newRow[dueCol] = newDueStr;
  newRow[execCol] = "";
  newRow[doneDateCol] = "";
  newRow[parentIdCol] = String(taskId);

  // Формулы:
  const nextRowNumber = rows.length + 1;
  newRow[daysLeftCol] = `=МАКС(0; ${String.fromCharCode(65 + dueCol)}${nextRowNumber}-СЕГОДНЯ())`;
  newRow[coefCol] = `=ЕСЛИ(${String.fromCharCode(65 + freqCol)}${nextRowNumber}>0; (${String.fromCharCode(65 + daysLeftCol)}${nextRowNumber}/${String.fromCharCode(65 + freqCol)}${nextRowNumber})*100; "")`;

  // append
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${env.SHEET_DATA}!A:Z:append?valueInputOption=USER_ENTERED`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [newRow] })
  });

  return true;
}
