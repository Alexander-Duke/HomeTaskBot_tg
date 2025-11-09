// src/sheets.js

/**
 * Декодирование ключа сервисного аккаунта
 */
function getServiceAccountKey(env) {
  return JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(env.GOOGLE_SERVICE_KEY_BASE64), c => c.charCodeAt(0))
    )
  );
}

/**
 * Генерация JWT и получение access_token для Google APIs
 */
async function getAccessToken(serviceAccountBase64) {
  const service = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(serviceAccountBase64), c => c.charCodeAt(0))
    )
  );

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: service.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const base64url = (src) =>
    btoa(JSON.stringify(src))
      .replace(/=+/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsigned = `${base64url(header)}.${base64url(payload)}`;

  // ✅ Правильное преобразование PEM → PKCS8 DER
  const pem = service.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "");

  const keyData = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))
  );

  const signed = `${unsigned}.${btoa(String.fromCharCode(...signature))
    .replace(/=+/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")}`;

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signed}`,
  });

  const data = await tokenRes.json();
  return data.access_token;
}

/**
 * Прочитать весь лист как массив строк
 */
export async function readSheet(env, sheetName) {
  const token = await getAccessToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${sheetName}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(r => r.json());

  return res.values || [];
}

/**
 * Записать данные в лист (полная перезапись)
 */
export async function writeSheet(env, sheetName, values) {
  const token = await getAccessToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${sheetName}?valueInputOption=USER_ENTERED`;

  await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values })
  });
}

/**
 * Обновить одну конкретную ячейку
 */
export async function updateCell(env, sheetName, cellRange, value) {
  const token = await getAccessToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${sheetName}!${cellRange}?valueInputOption=USER_ENTERED`;

  await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: [[value]] })
  });
}

export async function undoTask(taskId, env) {
  const accessToken = await getAccessToken(env);

  // 1) Получаем метаданные, чтобы знать sheetId
  const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then(r => r.json());

  const sheetMeta = meta.sheets.find(s => s.properties && s.properties.title === env.SHEET_DATA);
  if (!sheetMeta) return false;
  const sheetIdNum = sheetMeta.properties.sheetId;

  // 2) Загружаем весь лист
  const data = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${env.SHEET_DATA}!A:Z`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then(r => r.json());

  const rows = data.values || [];
  if (rows.length < 2) return false;

  // 3) Заголовки
  const headers = rows[0];
  const idCol        = headers.indexOf("ID");
  const parentIdCol  = headers.indexOf("ParentID");
  const statusCol    = headers.indexOf("Статус");
  const execCol      = headers.indexOf("Исполнитель");
  const doneDateCol  = headers.indexOf("Дата выполнения");

  if (idCol === -1 || parentIdCol === -1) return false;

  // 4) Ищем строку по ID
  const currentIndex = rows.findIndex((r, i) => i > 0 && String(r[idCol]) === String(taskId));
  if (currentIndex === -1) return false;

  const sheetRow = currentIndex + 1;
  const row = rows[currentIndex];
  const parentId = row[parentIdCol];

  // 5) Если нет ParentID → это родитель, откатывать нельзя
  if (!parentId || String(parentId).trim() === "") {
    return false;
  }

  // 6) Ищем родителя
  const parentIndex = rows.findIndex((r, i) => i > 0 && String(r[idCol]) === String(parentId));
  if (parentIndex === -1) return false;
  const parentSheetRow = parentIndex + 1;

  // 7) Удаляем текущую (дочернюю) строку
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
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
    })
  });

  // 8) Восстанавливаем родителя
  async function updateCell(col, row, value) {
    return fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${env.SHEET_DATA}!${String.fromCharCode(65 + col)}${row}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [[value]] })
      }
    );
  }

  await updateCell(statusCol,   parentSheetRow, "FALSE");
  await updateCell(execCol,     parentSheetRow, "");
  await updateCell(doneDateCol, parentSheetRow, "");

  return true;
}
