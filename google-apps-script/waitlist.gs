// Optional but recommended: paste the ID from the Google Sheet URL here.
// Example: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
const SPREADSHEET_ID = "1i2_lUmRSIVA1iN3zaE8mLrR-8QEpOUPKtM8Y6aHfw1w";
const SHEET_NAME = "Waitlist";
const EVENT_SHEET_NAME = "Events";

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

const EVENT_HEADERS = [
  "received_at",
  "event_at",
  "event_type",
  "session_id",
  "page_url",
  "page_path",
  "page_hash",
  "referrer",
  "section_id",
  "section_label",
  "element_type",
  "target_text",
  "target_href",
  "target_id",
  "target_classes",
  "target_label",
  "viewport_width",
  "viewport_height",
  "error",
  "raw_payload",
];

function doGet() {
  const spreadsheet = getSpreadsheet_();
  const waitlistSheet = getSheet_(spreadsheet, SHEET_NAME);
  const eventSheet = getSheet_(spreadsheet, EVENT_SHEET_NAME);

  return jsonResponse_({
    ok: true,
    service: "Grand website backend",
    spreadsheet_url: spreadsheet.getUrl(),
    waitlist_sheet_name: waitlistSheet.getName(),
    waitlist_last_row: waitlistSheet.getLastRow(),
    event_sheet_name: eventSheet.getName(),
    event_last_row: eventSheet.getLastRow(),
  });
}

function doPost(event) {
  try {
    const payload = JSON.parse(event?.postData?.contents || "{}");

    if (payload.type === "analytics_event") {
      return handleAnalyticsEvent_(payload);
    }

    return handleWaitlistSignup_(payload);
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error) });
  }
}

function handleWaitlistSignup_(payload) {
  const email = String(payload.email || "").trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse_({ ok: false, error: "invalid_email" });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  let result;
  try {
    const spreadsheet = getSpreadsheet_();
    const sheet = getSheet_(spreadsheet, SHEET_NAME);
    ensureHeaders_(sheet, HEADERS);
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
}

function handleAnalyticsEvent_(payload) {
  const eventType = String(payload.event_type || "").trim();

  if (!eventType) {
    return jsonResponse_({ ok: false, error: "missing_event_type" });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  let result;
  try {
    const spreadsheet = getSpreadsheet_();
    const sheet = getSheet_(spreadsheet, EVENT_SHEET_NAME);
    ensureHeaders_(sheet, EVENT_HEADERS);
    sheet.appendRow(rowForEventPayload_(payload));
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
}

function getSpreadsheet_() {
  const spreadsheet = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("No spreadsheet found. Bind this script to a Google Sheet or set SPREADSHEET_ID.");
  }

  return spreadsheet;
}

function getSheet_(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() > 0) return;

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
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

function rowForEventPayload_(payload) {
  const viewport = payload.viewport || {};

  return [
    new Date(),
    payload.event_at || "",
    payload.event_type || "",
    payload.session_id || "",
    payload.page_url || "",
    payload.page_path || "",
    payload.page_hash || "",
    payload.referrer || "",
    payload.section_id || "",
    payload.section_label || "",
    payload.element_type || "",
    truncate_(payload.target_text, 500),
    payload.target_href || "",
    payload.target_id || "",
    payload.target_classes || "",
    payload.target_label || "",
    valueOrBlank_(viewport.width),
    valueOrBlank_(viewport.height),
    payload.error || "",
    JSON.stringify(payload),
  ];
}

function valueOrBlank_(value) {
  return value === undefined || value === null ? "" : value;
}

function truncate_(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
