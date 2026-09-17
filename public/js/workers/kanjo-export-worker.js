/* Kanjo Ops — background export/parse worker (P1.7)
 *
 * Runs the CPU-heavy parts of the export & catalog import pipelines off the
 * main thread so a big XLSX build or a multi-megabyte catalogue parse never
 * freezes the dashboard on low-end mobile devices.
 *
 * Classic (non-module) worker on purpose: it must import the SheetJS UMD
 * bundle through importScripts(), which module workers cannot do.
 *
 * Protocol: { id, type, ...payload } -> { id, ok, result | error }
 *   xlsx            { sheets:[{name, header, rows, colWidth}], fileName, bookType }
 *   parse-json      { text } -> { value }
 *   parse-csv       { text } -> { records }        (same dialect as catalog.js)
 *   parse-raw-text  { text } -> { items }          (products scraped from raw JSON text)
 *
 * SheetJS is loaded lazily and only when an xlsx task actually runs. If the CDN
 * is unreachable the worker answers with ok:false and the caller falls back to
 * the original synchronous main-thread path (see utils/exportWorker.js).
 */

'use strict';

var XLSX_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
var MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
var XLSX_READY = null;

function loadXlsx() {
    if (XLSX_READY) return XLSX_READY;
    XLSX_READY = new Promise(function (resolve, reject) {
        try {
            if (typeof XLSX !== 'undefined' && XLSX.utils) { resolve(true); return; }
            importScripts(XLSX_CDN);
            if (typeof XLSX !== 'undefined' && XLSX.utils) resolve(true);
            else reject(new Error('XLSX_UNAVAILABLE'));
        } catch (err) {
            reject(err);
        }
    });
    return XLSX_READY;
}

function sheetFromSpec(xlsx, sheet) {
    var header = sheet.header || [];
    if (sheet.rows && sheet.rows.length) {
        return xlsx.utils.json_to_sheet(sheet.rows, header.length ? { header: header } : undefined);
    }
    return xlsx.utils.aoa_to_sheet([header]);
}

async function buildXlsx(msg) {
    await loadXlsx();
    var wb = XLSX.utils.book_new();
    (msg.sheets || []).forEach(function (sheet) {
        var ws = sheetFromSpec(XLSX, sheet);
        if (sheet.colWidth && sheet.header && sheet.header.length) {
            ws['!cols'] = sheet.header.map(function () { return { wch: sheet.colWidth }; });
        }
        XLSX.utils.book_append_sheet(wb, ws, sheet.name || 'Sheet');
    });
    var buffer = XLSX.write(wb, { bookType: msg.bookType || 'xlsx', type: 'array' });
    return { buffer: buffer, mime: MIME_XLSX, fileName: msg.fileName || 'kanjo-export.xlsx' };
}

/* Kept byte-for-byte compatible with the main-thread parser in catalog.js so a
   worker-parsed CSV produces exactly the same records as the synchronous path. */
function parseCsvRecords(text) {
    var raw = String(text || '').replace(/^\uFEFF/, '');
    var rows = [];
    var row = [];
    var cell = '';
    var inQuotes = false;
    for (var i = 0; i < raw.length; i++) {
        var ch = raw[i];
        var next = raw[i + 1];
        if (inQuotes) {
            if (ch === '"' && next === '"') { cell += '"'; i++; }
            else if (ch === '"') { inQuotes = false; }
            else { cell += ch; }
            continue;
        }
        if (ch === '"') { inQuotes = true; continue; }
        if (ch === ',' || ch === ';') { row.push(cell); cell = ''; continue; }
        if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
        if (ch === '\r') continue;
        cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];
    var headers = rows[0].map(function (h) { return String(h || '').trim().toLowerCase(); });
    var records = [];
    for (var r = 1; r < rows.length; r++) {
        var cols = rows[r];
        var hasValue = false;
        for (var c = 0; c < cols.length; c++) {
            if (String(cols[c] || '').trim()) { hasValue = true; break; }
        }
        if (!hasValue) continue;
        var obj = {};
        headers.forEach(function (h, idx) { obj[h] = cols[idx] == null ? '' : cols[idx]; });
        records.push(obj);
    }
    return records;
}

function parseRawText(text, category) {
    var cleanText = String(text || '').replace(/\\"/g, '"');
    var regex = /"imageUrl"\s*:\s*"([^"]+)"[\s\S]*?"productName"\s*:\s*"([^"]+)"[\s\S]*?"sellingPrice"\s*:\s*([0-9.]+)/g;
    var seen = Object.create(null);
    var items = [];
    var match;
    while ((match = regex.exec(cleanText)) !== null) {
        var name = String(match[2] || '').trim();
        if (!name || seen[name]) continue;
        seen[name] = true;
        var price = parseFloat(match[3]);
        items.push({
            name: name,
            price: Number.isFinite(price) ? price : 0,
            imageUrl: String(match[1] || '').trim(),
            category: category || ''
        });
    }
    return items;
}

self.onmessage = async function (event) {
    var msg = event.data || {};
    var id = msg.id;
    try {
        var result;
        if (msg.type === 'xlsx') result = await buildXlsx(msg);
        else if (msg.type === 'parse-json') result = { value: JSON.parse(msg.text) };
        else if (msg.type === 'parse-csv') result = { records: parseCsvRecords(msg.text) };
        else if (msg.type === 'parse-raw-text') result = { items: parseRawText(msg.text, msg.category) };
        else throw new Error('UNKNOWN_WORKER_TASK');
        var transfer = (result && result.buffer) ? [result.buffer] : [];
        self.postMessage({ id: id, ok: true, result: result }, transfer);
    } catch (err) {
        self.postMessage({ id: id, ok: false, error: String((err && err.message) || err) });
    }
};
