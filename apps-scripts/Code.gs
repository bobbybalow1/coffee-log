/**
 * Ember Roast Log — Google Apps Script backend
 * Receives a roast (as JSON) from the web app and appends it as a row.
 *
 * SETUP (one time):
 * 1. Open your Google Sheet → Extensions → Apps Script.
 * 2. Delete anything in the editor, paste ALL of this, then Save.
 * 3. Deploy → New deployment → gear icon → "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 4. Authorize when prompted (it's your own script writing to your own sheet).
 * 5. Copy the "/exec" URL it gives you and paste it into the app's
 *    Connection settings.
 *
 * AFTER EDITING THIS FILE: Deploy → Manage deployments → edit (pencil) →
 * Version: "New version" → Deploy. This keeps the SAME /exec URL.
 * (Choosing "New deployment" instead would hand you a different URL.)
 */

var SHEET_NAME = 'Roasts';

var HEADERS = [
  'Saved at', 'Date', 'Origin', 'Process', 'Preheated',
  'Green (g)', 'Roasted (g)', 'Loss %',
  'P1 Temp', 'P1 Min', 'P2 Temp', 'P2 Min',
  'P3 Temp', 'P3 Min', 'P4 Temp', 'P4 Min',
  'FC Min', 'SC Min',
  'Total Min', 'DTR %', 'Rating', 'Notes', 'Favorite'
];

// Same order as HEADERS — these are the keys the web app understands when it
// reads a roast back. Keep the two arrays in lockstep.
var KEYS = [
  'savedAt', 'date', 'origin', 'process', 'preheated',
  'green', 'roasted', 'loss',
  'p1temp', 'p1dur', 'p2temp', 'p2dur',
  'p3temp', 'p3dur', 'p4temp', 'p4dur',
  'fcMin', 'scMin',
  'totalMin', 'dtr', 'rating', 'notes', 'favorite'
];

function doPost(e) {
  var lock = LockService.getScriptLock();      // stop two roasts colliding on the same row
  lock.waitLock(30000);
  try {
    var d = JSON.parse(e.postData.contents);
    var sheet = getSheet_();

    if (d.action === 'delete')   return json_(deleteRoast_(sheet, d.savedAt));
    if (d.action === 'favorite') return json_(setFavorite_(sheet, d.savedAt, !!d.value));
    if (d.action === 'update')   return json_(updateRoast_(sheet, d));

    sheet.appendRow(buildRow_(d, d.timestamp || new Date()));
    return json_({ status: 'ok' });
  } catch (err) {
    return json_({ status: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Build the full row array for a roast. savedAtVal goes in column A (a fresh
// timestamp for new roasts, the original value when updating in place).
function buildRow_(d, savedAtVal) {
  var isNum = function (x) { return typeof x === 'number' && isFinite(x); };
  var loss = (d.green && d.roasted) ? ((d.green - d.roasted) / d.green * 100) : '';
  var durs = [d.p1dur, d.p2dur, d.p3dur, d.p4dur].filter(isNum);   // ignore "N/A" phases
  var total = durs.reduce(function (a, b) { return a + b; }, 0);
  var dtr = '';
  if (isNum(d.fcMin) && total > 0)      dtr = Math.max(0, total - d.fcMin) / total * 100;
  else if (isNum(d.p3dur) && total > 0) dtr = d.p3dur / total * 100;
  return [
    savedAtVal, d.date, d.origin, d.process, d.preheated,
    d.green, d.roasted, round_(loss),
    d.p1temp, d.p1dur, d.p2temp, d.p2dur,
    d.p3temp, d.p3dur, d.p4temp, d.p4dur,
    d.fcMin, d.scMin,
    round_(total), round_(dtr), d.rating, d.notes, !!d.favorite
  ];
}

// Overwrite the row matching d.savedAt with fresh values (keeping its original
// "Saved at" cell so the row's identity doesn't change).
function updateRoast_(sheet, d) {
  var last = sheet.getLastRow();
  if (last < 2 || !d.savedAt) return { status: 'ok', updated: 0 };
  var colA = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    var v = colA[i][0];
    var key = (v instanceof Date) ? v.toISOString() : String(v);
    if (key === String(d.savedAt)) {
      sheet.getRange(i + 2, 1, 1, HEADERS.length).setValues([buildRow_(d, v)]);
      return { status: 'ok', updated: 1 };
    }
  }
  return { status: 'ok', updated: 0 };
}

// Delete the row whose "Saved at" (column A) matches the given timestamp.
// Matching is done by normalizing both sides to the same form, since the cell
// may come back as a Date or a string depending on how Sheets stored it.
function deleteRoast_(sheet, savedAt) {
  var last = sheet.getLastRow();
  if (last < 2 || !savedAt) return { status: 'ok', deleted: 0 };
  var colA = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    var v = colA[i][0];
    var key = (v instanceof Date) ? v.toISOString() : String(v);
    if (key === String(savedAt)) {
      sheet.deleteRow(i + 2);            // +2: skip header row and 0-based index
      return { status: 'ok', deleted: 1 };
    }
  }
  return { status: 'ok', deleted: 0 };
}

// Set the Favorite cell (true/false) on the row matching the given savedAt.
function setFavorite_(sheet, savedAt, value) {
  var last = sheet.getLastRow();
  if (last < 2 || !savedAt) return { status: 'ok', updated: 0 };
  var favCol = HEADERS.indexOf('Favorite') + 1;     // 1-based column index
  var colA = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    var v = colA[i][0];
    var key = (v instanceof Date) ? v.toISOString() : String(v);
    if (key === String(savedAt)) {
      sheet.getRange(i + 2, favCol).setValue(value);
      return { status: 'ok', updated: 1 };
    }
  }
  return { status: 'ok', updated: 0 };
}

// GET returns every saved roast as JSON.
// If a ?callback=name param is present, it responds as JSONP so a browser on a
// different origin can read it (a plain fetch would be blocked by CORS).
function doGet(e) {
  var callback = e && e.parameter ? e.parameter.callback : null;
  // only allow a safe function name to be echoed back into the response
  if (callback && !/^[A-Za-z0-9_]+$/.test(callback)) callback = null;
  try {
    var sheet = getSheet_();
    var rows = [];
    var last = sheet.getLastRow();
    if (last > 1) {
      var values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
      values.forEach(function (r) {
        var o = {};
        KEYS.forEach(function (k, i) { o[k] = r[i]; });
        rows.push(o);
      });
    }
    return reply_({ status: 'ok', roasts: rows.reverse() }, callback); // newest first
  } catch (err) {
    return reply_({ status: 'error', message: String(err) }, callback);
  }
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    // existing sheet: make sure the header has every current column (e.g. Favorite)
    var hdr = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    if (hdr[HEADERS.length - 1] !== HEADERS[HEADERS.length - 1]) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
  }
  return sheet;
}

function round_(n) { return (n === '' || n == null) ? '' : Math.round(n * 10) / 10; }

// Returns plain JSON, or JSONP (json wrapped in a function call) when a callback is given.
function reply_(obj, callback) {
  var body = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + body + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

function json_(obj) { return reply_(obj, null); }
