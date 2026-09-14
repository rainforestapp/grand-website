const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("google-apps-script/waitlist.gs", "utf8");
const context = {
  Array,
  Date,
  Error,
  JSON,
  Math,
  Object,
  RegExp,
  String,
  console,
  ContentService: {
    MimeType: { JSON: "json" },
    createTextOutput(text) {
      return {
        text,
        setMimeType() {
          return this;
        },
      };
    },
  },
  LockService: {
    getScriptLock() {
      return { releaseLock() {}, waitLock() {} };
    },
  },
  SpreadsheetApp: {},
  Utilities: { sleep() {} },
};

vm.runInNewContext(
  `${source}\n(function runTests() {
    const rows = [];
    const spreadsheet = {
      getUrl() { return "https://example.test/sheet"; },
      getSheetByName() { return sheet; },
      insertSheet() { return sheet; },
    };
    const sheet = {
      appendRow(row) { rows.push(row.slice()); },
      getLastColumn() { return HEADERS.length; },
      getLastRow() { return rows.length + 1; },
      getMaxColumns() { return 64; },
      getMaxRows() { return 100; },
      getName() { return "Grand phone number alpha list"; },
      getParent() { return spreadsheet; },
      insertColumnsAfter() {},
      setFrozenRows() {},
      getRange(row, column, rowCount, columnCount) {
        return {
          getValues() {
            if (row === 1) return [HEADERS.slice(0, columnCount)];
            return Array.from({ length: rowCount }, (_, index) => [
              rows[row - 2 + index]?.[column - 1] || "",
            ]);
          },
          setNumberFormat() {},
          setValues() {},
        };
      },
    };
    SpreadsheetApp.openById = function openById() { return spreadsheet; };

    const submissionId = "123e4567-e89b-42d3-a456-426614174000";
    const payload = {
      type: "waitlist_signup",
      product: "grandphone",
      email: "qa@example.com",
      waitlist_variant: "email",
      candidate_id: submissionId,
      submission_id: submissionId,
    };
    const first = JSON.parse(handleWaitlistSignup_(payload).text);
    const second = JSON.parse(handleWaitlistSignup_(payload).text);

    assert(first.ok === true && first.duplicate === false, "first signup should append");
    assert(second.ok === true && second.duplicate === true, "retry should be idempotent");
    assert(rows.length === 1, "retry appended a duplicate row");
    assert(rows[0].length === HEADERS.length, "signup row/header width mismatch");

    const eventRow = rowForEventPayload_({
      event_type: "waitlist_submit_success",
      candidate_id: submissionId,
      submission_id: submissionId,
      delivery_confirmed: true,
      utm_source: "reddit",
      qa_mode: true,
    });
    assert(eventRow.length === EVENT_HEADERS.length, "event row/header width mismatch");
    assert(eventRow[EVENT_HEADERS.indexOf("submission_id")] === submissionId);
    assert(eventRow[EVENT_HEADERS.indexOf("utm_source")] === "reddit");
    assert(eventRow[EVENT_HEADERS.indexOf("delivery_confirmed")] === true);
    assert(eventRow[EVENT_HEADERS.indexOf("qa_mode")] === true);
  })();`,
  { ...context, assert },
);

console.log("waitlist backend: 9 assertions passed");
