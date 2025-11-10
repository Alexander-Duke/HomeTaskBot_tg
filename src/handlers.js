import {
  getZones,
  getTasksByZone,
  getExecutorNameByTelegramId,
  markTaskAsDone,
  undoTask,
  getAllActiveTasks
} from "./sheets.js";

export function setupBotHandlers(bot, env) {

  bot.command("start", async (ctx) => {
    await ctx.reply("👋 Бот запущен! Переезд в Cloudflare Workers идет успешно.");
  });

  // позже добавим остальное…
}



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


