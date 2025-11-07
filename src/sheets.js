import { google } from 'googleapis';

export function initGoogleSheets(keyJson) {
  const key = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}
