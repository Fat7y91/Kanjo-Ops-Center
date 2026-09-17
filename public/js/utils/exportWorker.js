/* Kanjo Ops — main-thread facade over the export worker (P1.7)
 *
 * Exposes window.kanjoExportWorker with a single async entry point used by the
 * export/catalog pipelines:
 *
 *   writeWorkbook(sheets, fileName)  -> Promise<true>   (downloads the file)
 *   parseJson(text)                  -> Promise<value>
 *   parseCsv(text)                   -> Promise<records>
 *   parseRawText(text, category)     -> Promise<items>
 *
 * Every call transparently falls back to the original synchronous main-thread
 * implementation when Workers are unavailable, the worker script fails to boot,
 * or a task errors. Callers therefore never need to handle "no worker".
 */

const WORKER_URL = new URL('../workers/kanjo-export-worker.js', import.meta.url).href;
const WORKER_SUPPORTED = typeof Worker !== 'undefined';

let workerInstance = null;
let sequence = 0;
const pending = new Map();

const ensureWorker = () => {
    if (!WORKER_SUPPORTED) return null;
    if (workerInstance) return workerInstance;
    try {
        workerInstance = new Worker(WORKER_URL);
    } catch (err) {
        console.warn('[exportWorker] worker init failed; using main thread:', err && err.message);
        workerInstance = null;
        return null;
    }
    workerInstance.onmessage = (event) => {
        const msg = event.data || {};
        const task = pending.get(msg.id);
        if (!task) return;
        pending.delete(msg.id);
        if (msg.ok) task.resolve(msg.result);
        else task.reject(new Error(msg.error || 'WORKER_ERROR'));
    };
    workerInstance.onerror = (event) => {
        const err = new Error((event && event.message) || 'WORKER_RUNTIME_ERROR');
        console.warn('[exportWorker] worker runtime error:', err.message);
        pending.forEach((task) => task.reject(err));
        pending.clear();
        try { workerInstance.terminate(); } catch (e) { /* ignore */ }
        workerInstance = null;
    };
    return workerInstance;
};

const run = (payload, transfer) => new Promise((resolve, reject) => {
    const worker = ensureWorker();
    if (!worker) { reject(new Error('WORKER_UNAVAILABLE')); return; }
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    try {
        worker.postMessage(Object.assign({ id }, payload), transfer || []);
    } catch (err) {
        pending.delete(id);
        reject(err);
    }
});

const downloadBuffer = (buffer, fileName, mime) => {
    const blob = new Blob([buffer], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName || 'kanjo-export.xlsx';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
};

/* Synchronous fallback identical to the historic inline implementation. */
const writeWorkbookOnMainThread = (sheets, fileName) => {
    if (typeof XLSX === 'undefined' || !XLSX.utils) throw new Error('EXCEL_LIB_UNAVAILABLE');
    const workbook = XLSX.utils.book_new();
    (sheets || []).forEach((sheet) => {
        const header = sheet.header || [];
        const worksheet = (sheet.rows && sheet.rows.length)
            ? XLSX.utils.json_to_sheet(sheet.rows, header.length ? { header: header } : undefined)
            : XLSX.utils.aoa_to_sheet([header]);
        if (sheet.colWidth && header.length) {
            worksheet['!cols'] = header.map(() => ({ wch: sheet.colWidth }));
        }
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name || 'Sheet');
    });
    XLSX.writeFile(workbook, fileName);
};

const writeWorkbook = async (sheets, fileName) => {
    if (WORKER_SUPPORTED) {
        try {
            const result = await run({ type: 'xlsx', sheets: sheets, fileName: fileName, bookType: 'xlsx' });
            if (result && result.buffer) {
                downloadBuffer(result.buffer, result.fileName || fileName, result.mime);
                return true;
            }
        } catch (err) {
            console.warn('[exportWorker] xlsx offload failed; using main thread:', err && err.message);
        }
    }
    writeWorkbookOnMainThread(sheets, fileName);
    return true;
};

const parseJson = async (text) => {
    if (WORKER_SUPPORTED) {
        try {
            const result = await run({ type: 'parse-json', text: text });
            if (result && Object.prototype.hasOwnProperty.call(result, 'value')) return result.value;
        } catch (err) {
            console.warn('[exportWorker] JSON offload failed; using main thread:', err && err.message);
        }
    }
    return JSON.parse(text);
};

const parseCsv = async (text) => {
    if (WORKER_SUPPORTED) {
        try {
            const result = await run({ type: 'parse-csv', text: text });
            if (result && Array.isArray(result.records)) return result.records;
        } catch (err) {
            console.warn('[exportWorker] CSV offload failed; using main thread:', err && err.message);
        }
    }
    return null; // caller keeps its own synchronous parser as the fallback
};

const parseRawText = async (text, category) => {
    if (WORKER_SUPPORTED) {
        try {
            const result = await run({ type: 'parse-raw-text', text: text, category: category });
            if (result && Array.isArray(result.items)) return result.items;
        } catch (err) {
            console.warn('[exportWorker] raw-text offload failed; using main thread:', err && err.message);
        }
    }
    return null; // caller keeps its own synchronous parser as the fallback
};

window.kanjoExportWorker = {
    supported: WORKER_SUPPORTED,
    run: run,
    writeWorkbook: writeWorkbook,
    parseJson: parseJson,
    parseCsv: parseCsv,
    parseRawText: parseRawText,
    downloadBuffer: downloadBuffer,
    terminate: () => {
        if (workerInstance) {
            try { workerInstance.terminate(); } catch (e) { /* ignore */ }
            workerInstance = null;
        }
        pending.clear();
    }
};

export { };
