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
  // Captured passively at signup via client-side IP geolocation.
  "geo_city",
  "geo_region",
  "geo_country",
  "geo_postal",
  // Collected on the post-signup profile page (welcome.html); blank until the
  // person completes it, then filled in on the same row by email.
  "zipcode",
  "reason_interested",
  "lives_alone",
  "alpha_tester",
  "profile_completed_at",
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

    if (payload.type === "waitlist_profile") {
      return handleWaitlistProfile_(payload);
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

function handleWaitlistProfile_(payload) {
  const email = String(payload.email || "").trim().toLowerCase();

  const profileValues = {
    zipcode: String(payload.zipcode || "").trim(),
    reason_interested: String(payload.reason_interested || "").trim(),
    lives_alone: String(payload.lives_alone || "").trim(),
    alpha_tester: String(payload.alpha_tester || "").trim(),
    profile_completed_at: payload.profile_completed_at || new Date().toISOString(),
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  let result;
  try {
    const spreadsheet = getSpreadsheet_();
    const sheet = getSheet_(spreadsheet, SHEET_NAME);
    ensureHeaders_(sheet, HEADERS);

    const rowIndex = email ? findRowByEmail_(sheet, email) : -1;

    if (rowIndex > 0) {
      // Update the existing signup row in place — one row per person.
      writeProfileColumns_(sheet, rowIndex, profileValues);
      result = { ok: true, matched: true, updated_row: rowIndex };
    } else {
      // No matching signup (email missing or unknown) — append a standalone
      // row so the answers aren't lost.
      const row = new Array(HEADERS.length).fill("");
      row[HEADERS.indexOf("received_at")] = new Date();
      row[HEADERS.indexOf("email")] = email;
      row[HEADERS.indexOf("source")] = payload.source || "";
      row[HEADERS.indexOf("raw_payload")] = JSON.stringify(payload);
      applyProfileToRow_(row, profileValues);
      sheet.appendRow(row);
      result = { ok: true, matched: false, appended_row: sheet.getLastRow() };
    }
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
  // Empty sheet: write the header row and freeze it.
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  // Existing sheet: if columns were appended to `headers`, extend the header
  // row in place so the live sheet auto-migrates without a manual step. Safe
  // because we only ever append columns to the end — no existing column moves,
  // so overwriting row 1 rewrites the same labels plus the new ones.
  if (sheet.getLastColumn() < headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function findRowByEmail_(sheet, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const emailColumn = HEADERS.indexOf("email") + 1;
  const values = sheet.getRange(2, emailColumn, lastRow - 1, 1).getValues();

  // Search from the bottom so the most recent signup wins on duplicate emails.
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] || "").trim().toLowerCase() === email) {
      return i + 2;
    }
  }

  return -1;
}

function writeProfileColumns_(sheet, rowIndex, profileValues) {
  Object.keys(profileValues).forEach((header) => {
    const column = HEADERS.indexOf(header) + 1;
    if (column > 0) {
      sheet.getRange(rowIndex, column).setValue(profileValues[header]);
    }
  });
}

function applyProfileToRow_(row, profileValues) {
  Object.keys(profileValues).forEach((header) => {
    const index = HEADERS.indexOf(header);
    if (index >= 0) row[index] = profileValues[header];
  });
}

function rowForPayload_(email, payload) {
  const viewport = payload.viewport || {};
  const screen = payload.screen || {};
  const connection = payload.connection || {};
  const geo = payload.geo || {};

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
    geo.city || "",
    geo.region || "",
    geo.country || "",
    geo.postal || "",
    // zipcode, reason_interested, lives_alone, alpha_tester,
    // profile_completed_at are left empty here and filled by the profile page.
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
