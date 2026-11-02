/**
 * Graduating Capacity: the link between the GitHub Pages app and this Google Sheet.
 *
 * Setup (full steps in README.md):
 *   1. Change PASSCODE below to something only your team knows (8+ characters).
 *   2. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *   3. Paste the /exec URL and the passcode into the app.
 *
 * After changing this file or the passcode, use Deploy > Manage deployments >
 * Edit > New version, otherwise the old code keeps running.
 */
const PASSCODE = 'CHANGE-ME';

const SETTINGS = 'Settings';
const ID_TABS = ['Faculty', 'Graduated', 'Scholars'];      // rows are matched by their ID column
const TEXT_TABS = [SETTINGS, 'Faculty', 'Graduated', 'Scholars', 'Log'];
const NUMBER_TABS = ['Capacity'];                          // written by the app, numbers stay numbers

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    if (PASSCODE === 'CHANGE-ME' || String(PASSCODE).length < 8) {
      throw new Error('Set a passcode of at least 8 characters at the top of Code.gs, then deploy a new version.');
    }
    if (req.pass !== PASSCODE) {
      Utilities.sleep(1500);                               // slows down passcode guessing
      out = {ok: false, auth: true, error: 'Wrong passcode'};
    } else {
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        if (req.action === 'load') out = load_();
        else if (req.action === 'rev') out = {ok: true, revision: revision_()};
        else if (req.action === 'save') out = save_(req);
        else throw new Error('Unknown action');
      } finally {
        lock.releaseLock();
      }
    }
  } catch (err) {
    out = {ok: false, error: String(err && err.message || err)};
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Runs when someone edits the Sheet by hand, so that open copies of the app know to reload. */
function onEdit(e) {
  const name = e && e.range && e.range.getSheet().getName();
  if (TEXT_TABS.includes(name) && name !== 'Log') bump_();
}

function book_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function tab_(name) {
  const book = book_();
  let sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    if (TEXT_TABS.includes(name)) sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
  }
  return sh;
}

/** Google refuses to write beyond a sheet's edge (1000 rows, 26 columns to begin with). */
function room_(sh, rows, cols) {
  if (rows > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows() + 500);
  if (cols > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
}

function header_(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getDisplayValues()[0] : [];
}

/** Returns the header row, adding any columns the app needs that the Sheet does not have yet. */
function ensureHeader_(sh, keys) {
  const head = header_(sh);
  const missing = keys.filter(k => !head.includes(k));
  if (missing.length) {
    room_(sh, 1, head.length + missing.length);
    sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    sh.setFrozenRows(1);
    head.push(...missing);
  }
  return head;
}

/** A value starting with = + - @ would otherwise run as a formula. */
function clean_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  const s = String(v);
  return /^[=+\-@]/.test(s) && isNaN(Number(s)) ? "'" + s : s;
}

function keysOf_(rows) {
  const keys = [];
  rows.forEach(r => Object.keys(r).forEach(k => { if (!keys.includes(k)) keys.push(k); }));
  return keys;
}

function dataRange_(sh, width) {
  const last = sh.getLastRow();
  return last > 1 ? sh.getRange(2, 1, last - 1, width) : null;
}

function revision_() {
  const sh = tab_(SETTINGS);
  const rows = sh.getDataRange().getDisplayValues();
  const row = rows.find(r => r[0] === 'revision');
  return row ? Number(row[1]) || 0 : 0;
}

function setSetting_(key, value) {
  const sh = tab_(SETTINGS);
  ensureHeader_(sh, ['Key', 'Value']);
  const rows = sh.getDataRange().getDisplayValues();
  const i = rows.findIndex(r => r[0] === key);
  const at = i >= 0 ? i + 1 : Math.max(rows.length, 1) + 1;
  room_(sh, at, 2);
  sh.getRange(at, 1, 1, 2).setNumberFormat('@').setValues([[key, clean_(String(value))]]);
}

function bump_() {
  const next = revision_() + 1;
  setSetting_('revision', next);
  return next;
}

/** A row typed into the Sheet by hand has no ID yet: give it one so the app can track it. */
function fillIds_(sh) {
  const head = header_(sh);
  const col = head.indexOf('ID');
  const range = col >= 0 && dataRange_(sh, head.length);
  if (!range) return;
  const values = range.getDisplayValues();
  let max = 0;
  values.forEach(r => { max = Math.max(max, Number(r[col]) || 0); });
  values.forEach((r, i) => {
    if (!r[col] && r.some(Boolean)) sh.getRange(i + 2, col + 1).setNumberFormat('@').setValue(String(++max));
  });
}

function load_() {
  const tabs = {};
  TEXT_TABS.concat(NUMBER_TABS).forEach(name => {
    const sh = tab_(name);
    if (ID_TABS.includes(name)) fillIds_(sh);
    const rows = sh.getDataRange().getDisplayValues();
    tabs[name] = rows.length && rows[0].some(Boolean) ? rows : [];
  });
  return {ok: true, revision: revision_(), tabs: tabs, sheetUrl: book_().getUrl()};
}

function upsert_(name, rows) {
  const sh = tab_(name);
  const head = ensureHeader_(sh, keysOf_(rows));
  const col = head.indexOf('ID');
  const range = dataRange_(sh, head.length);
  const values = range ? range.getValues() : [];
  const at = {};
  values.forEach((r, i) => { at[String(r[col])] = i; });
  const fresh = [];
  rows.forEach(obj => {
    const i = at[String(obj.ID)];
    const base = i === undefined ? head.map(() => '') : values[i];
    const merged = head.map((h, c) => (h in obj ? clean_(String(obj[h] ?? '')) : base[c]));
    if (i === undefined) fresh.push(merged);
    else sh.getRange(i + 2, 1, 1, head.length).setNumberFormat('@').setValues([merged]);
  });
  if (fresh.length) {
    room_(sh, values.length + 1 + fresh.length, head.length);
    sh.getRange(values.length + 2, 1, fresh.length, head.length).setNumberFormat('@').setValues(fresh);
  }
}

function remove_(name, ids) {
  const sh = tab_(name);
  const head = header_(sh);
  const col = head.indexOf('ID');
  const range = dataRange_(sh, head.length);
  if (col < 0 || !range) return;
  const values = range.getDisplayValues();
  const wanted = new Set(ids.map(String));
  const hits = values.map((r, i) => (wanted.has(r[col]) ? i + 2 : 0)).filter(Boolean);
  if (hits.length === values.length) {
    range.clearContent();                                  // Sheets refuses to delete every unfrozen row
    return;
  }
  hits.reverse().forEach(row => sh.deleteRow(row));
}

function replace_(name, rows, header) {
  const sh = tab_(name);
  sh.clearContents();
  const head = header && header.length ? header : keysOf_(rows);
  if (!head.length) return;
  const isText = TEXT_TABS.includes(name);
  const table = [head].concat(rows.map(r => head.map(h => (isText ? clean_(String(r[h] ?? '')) : clean_(r[h])))));
  room_(sh, table.length, head.length);
  const range = sh.getRange(1, 1, table.length, head.length);
  if (isText) range.setNumberFormat('@');
  range.setValues(table);
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  sh.setFrozenRows(1);
}

function append_(name, rows) {
  const sh = tab_(name);
  const head = ensureHeader_(sh, keysOf_(rows));
  const table = rows.map(r => head.map(h => clean_(String(r[h] ?? ''))));
  const first = Math.max(sh.getLastRow(), 1) + 1;
  room_(sh, first + table.length - 1, head.length);
  sh.getRange(first, 1, table.length, head.length).setNumberFormat('@').setValues(table);
}

/**
 * Applies one batch of changes from the app. A write based on an out-of-date copy is refused,
 * so two people cannot silently overwrite each other's roll counts.
 * A report-only write (just the Capacity tab) neither checks nor changes the revision.
 */
function save_(req) {
  const current = revision_();
  if (!req.reportOnly && Number(req.baseRevision) !== current) {
    return {ok: false, conflict: true, revision: current};
  }
  const each = (obj, fn) => Object.keys(obj || {}).forEach(k => fn(k, obj[k]));
  each(req.replace, (name, t) => replace_(name, t.rows, t.header));
  each(req.remove, (name, ids) => { if (ids.length) remove_(name, ids); });
  each(req.upsert, (name, rows) => { if (rows.length) upsert_(name, rows); });
  each(req.append, (name, rows) => { if (rows.length) append_(name, rows); });
  each(req.settings, setSetting_);
  return {ok: true, revision: req.reportOnly ? current : bump_()};
}
