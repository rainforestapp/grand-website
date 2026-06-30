// Optional but recommended: paste the ID from the Google Sheet URL here.
// Example: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
const SPREADSHEET_ID = "";
const SHEET_NAME = "Waitlist";

const HEADERS = [
  "received_at",
  "email",
  "source",
  "submitted_at",
  "page_url",
  "referrer",
  "user_agent",
  "user_agent_data",
  "language",
  "languages",
  "platform",
  "vendor",
  "timezone",
  "timezone_offset_minutes",
  "viewport_width",
  "viewport_height",
  "screen_width",
  "screen_height",
  "screen_color_depth",
  "screen_pixel_depth",
  "device_pixel_ratio",
  "hardware_concurrency",
  "device_memory_gb",
  "cookie_enabled",
  "do_not_track",
  "connection_effective_type",
  "connection_downlink",
  "connection_rtt",
  "connection_save_data",
  "raw_payload",
];

function doGet() {
  const sheet = getSheet_();

  return jsonResponse_({
    ok: true,
    service: "Grand waitlist",
    spreadsheet_url: sheet.getParent().getUrl(),
    sheet_name: sheet.getName(),
    last_row: sheet.getLastRow(),
  });
}

function doPost(event) {
  try {
    const payload = JSON.parse(event?.postData?.contents || "{}");
    const email = String(payload.email || "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse_({ ok: false, error: "invalid_email" });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    let result;
    try {
      const sheet = getSheet_();
      ensureHeaders_(sheet);
      sheet.appendRow(rowForPayload_(email, payload));
      result = {
        ok: true,
        spreadsheet_url: sheet.getParent().getUrl(),
        sheet_name: sheet.getName(),
        row: sheet.getLastRow(),
      };
    } finally {
      lock.releaseLock();
    }

    return jsonResponse_(result);
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error) });
  }
}

function getSheet_() {
  const spreadsheet = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("No spreadsheet found. Bind this script to a Google Sheet or set SPREADSHEET_ID.");
  }

  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() > 0) return;

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
}

function rowForPayload_(email, payload) {
  const viewport = payload.viewport || {};
  const screen = payload.screen || {};
  const connection = payload.connection || {};

  return [
    new Date(),
    email,
    payload.source || "",
    payload.submitted_at || "",
    payload.page_url || "",
    payload.referrer || "",
    payload.user_agent || "",
    JSON.stringify(payload.user_agent_data || null),
    payload.language || "",
    Array.isArray(payload.languages) ? payload.languages.join(", ") : "",
    payload.platform || "",
    payload.vendor || "",
    payload.timezone || "",
    valueOrBlank_(payload.timezone_offset_minutes),
    valueOrBlank_(viewport.width),
    valueOrBlank_(viewport.height),
    valueOrBlank_(screen.width),
    valueOrBlank_(screen.height),
    valueOrBlank_(screen.color_depth),
    valueOrBlank_(screen.pixel_depth),
    valueOrBlank_(payload.device_pixel_ratio),
    valueOrBlank_(payload.hardware_concurrency),
    valueOrBlank_(payload.device_memory_gb),
    valueOrBlank_(payload.cookie_enabled),
    payload.do_not_track || "",
    connection.effective_type || "",
    valueOrBlank_(connection.downlink),
    valueOrBlank_(connection.rtt),
    valueOrBlank_(connection.save_data),
    JSON.stringify(payload),
  ];
}

function valueOrBlank_(value) {
  return value === undefined || value === null ? "" : value;
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
