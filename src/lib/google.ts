import { google } from "googleapis";

console.log(
  "GOOGLE_REFRESH_TOKEN EXISTS:",
  !!process.env.GOOGLE_REFRESH_TOKEN
);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token:
    process.env.GOOGLE_REFRESH_TOKEN,
});

export const calendar =
  google.calendar({
    version: "v3",
    auth: oauth2Client,
  });