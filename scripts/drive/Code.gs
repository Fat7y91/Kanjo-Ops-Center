/*****************************************************************************
 * Kanjo Ops — Merchant Documents → Google Drive uploader
 * =====================================================================
 * GOAL
 *   Receives official merchant documents (Commercial Register, Tax Card,
 *   Menu) from the Kanjo Ops web app, stores them inside a per-merchant
 *   Google Drive folder, and returns the folder binding so the app can
 *   persist `driveFolderLink` back onto the merchant record in Firestore.
 *
 * DEPLOY INSTRUCTIONS
 * ---------------------------------------------------------------------
 * 1. Create a new Google Apps Script project:
 *        https://script.google.com/new
 * 2. Replace the default `Code.gs` content with THIS file, then save.
 * 3. Set the two config values at the top of this file:
 *        ROOT_FOLDER_ID — the ID of the parent folder under which one
 *                         folder per merchant is created. If left empty,
 *                         the script auto-creates a root folder named
 *                         "Kanjo Merchant Docs" on the Drive account.
 *        SCRIPT_TOKEN   — a long random string. Copy the SAME value into
 *                         the app's `public/js/config/constants.js` as
 *                         KANJO_DRIVE_SCRIPT_TOKEN. It stops casual
 *                         callers only; treat it as obfuscation, not a
 *                         real security boundary.
 * 4. Deploy → New deployment → type "Web app":
 *        - Execute as      : Me        (IMPORTANT — the account that owns Drive)
 *        - Who has access  : Anyone
 *    Copy the `/exec` URL and paste it into the app's
 *        KANJO_DRIVE_SCRIPT_URL  (public/js/config/constants.js)
 * 5. The deployed account must own the target Drive (or the ROOT_FOLDER_ID
 *    folder must be shared with it as Editor).
 *
 * API (POST, body is `text/plain` JSON to avoid a CORS preflight):
 *   {
 *     "token":        "<SCRIPT_TOKEN>",
 *     "merchantId":   "KJ-123456",          // immutable, is the folder binding
 *     "merchantName": "مطعم القاهرة",        // human-readable, for browsing only
 *     "files": [
 *       {
 *         "docType":  "commercial",         // commercial | tax | menu
 *         "label":    "السجل التجاري",       // shown in the saved file name
 *         "name":     "scan.pdf",            // original file name
 *         "mimeType": "application/pdf",
 *         "base64":   "<base64 content>"
 *       }
 *     ]
 *   }
 *
 *   Response 200:
 *   {
 *     "success": true,
 *     "message": "DONE",
 *     "merchantId": "KJ-123456",
 *     "driveFolderId": "<folder id>",
 *     "driveFolderLink": "https://drive.google.com/drive/folders/...",
 *     "files": [ { "docType", "name", "id", "url", "uploaded" } ]
 *   }
 *
 * SECURITY / LIMITS MODEL
 *   - Shared token gate only (obfuscation, not auth — see SECURITY NOTES).
 *   - 15 MB per file, 40 MB per request (mirrors the client-side limits).
 *   - Files and folders are created strictly under ROOT_FOLDER_ID.
 *   - File and folder names are sanitised (Drive-forbidden characters
 *     stripped) so a malicious name cannot escape the root or break paths.
 *   - Folder binding is keyed to the immutable merchantId (also embedded in
 *     the folder name for uniqueness); the merchant name is cosmetic only.
 *   - No deletion APIs exposed. Cleanup is manual, from Drive itself.
 *****************************************************************************/

/* ────────────────────────────── CONFIG ──────────────────────────────── */

var ROOT_FOLDER_ID = '';      // <-- set your root folder ID, or leave empty
var SCRIPT_TOKEN   = '';      // <-- set a long random string; mirror in constants.js

var ROOT_FOLDER_NAME = 'Kanjo Merchant Docs';

var MAX_FILE_BYTES  = 15 * 1024 * 1024;   // 15 MB per file
var MAX_TOTAL_BYTES = 40 * 1024 * 1024;   // 40 MB per request
var MAX_FILES       = 10;                 // max files per request

/* Allowed upload MIME types (reject anything else, e.g. executables). */
var ALLOWED_MIME = {
  'application/pdf': true,
  'image/jpeg': true,
  'image/png': true,
  'image/webp': true
};

/* ──────────────────────────── RESPONSE HELPERS ──────────────────────── */

function respond(success, message, extra) {
  var body = { success: success, message: message };
  if (extra) {
    for (var k in extra) {
      if (extra.hasOwnProperty(k)) body[k] = extra[k];
    }
  }
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ──────────────────────────── DRIVE HELPERS ─────────────────────────── */

function getRootFolder_() {
  if (ROOT_FOLDER_ID) {
    // Throws a friendly error via doPost if the ID is wrong/inaccessible.
    return DriveApp.getFolderById(ROOT_FOLDER_ID);
  }
  var it = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(ROOT_FOLDER_NAME);
}

/* Folders are bound to the immutable merchantId. The human-readable name is
   kept in the folder name purely for easy browsing in Drive:
       "مطعم القاهرة (KJ-123456)"   */
function getOrCreateMerchantFolder_(root, merchantId, merchantName) {
  var safeName = sanitizeName_(merchantName, 'Merchant', 80);
  var folderName = safeName + ' (' + merchantId + ')';

  var it = root.getFoldersByName(folderName);
  if (it.hasNext()) return it.next();

  // Second chance: the folder may exist elsewhere on the Drive (e.g. created
  // under a different root by an older version of this script). Reuse it so
  // we never create duplicate merchant folders.
  var search = DriveApp.searchFolders("name contains '" + merchantId + "'");
  while (search.hasNext()) {
    var f = search.next();
    if (f.getName().indexOf(merchantId) !== -1) return f;
  }

  return root.createFolder(folderName);
}

/* Save one file into the merchant folder. Existing files with the same name
   are overwritten (re-upload of a document for the same merchant). The saved
   name is prefixed with the human-readable docType label for easy browsing:
       "السجل التجاري - scan.pdf"   */
function saveFile_(folder, docType, label, fileName, mimeType, base64) {
  var baseName = sanitizeName_(fileName, 'document', 80);
  var prefix = sanitizeName_(label || docType || '', '', 40);
  var safeName = (prefix ? prefix + ' - ' : '') + baseName;

  var bytes = Utilities.base64Decode(String(base64));
  if (bytes.length > MAX_FILE_BYTES) {
    throw new Error('FILE_TOO_LARGE ' + safeName);
  }
  var blob = Utilities.newBlob(bytes, mimeType, safeName);

  var existing = folder.getFilesByName(safeName);
  if (existing.hasNext()) {
    var file = existing.next();
    file.setContent(blob);
    file.setContentType(mimeType);
    return { docType: docType, name: safeName, id: file.getId(), url: file.getUrl(), uploaded: false };
  }
  var created = folder.createFile(blob);
  return { docType: docType, name: safeName, id: created.getId(), url: created.getUrl(), uploaded: true };
}

function sanitizeName_(value, fallback, maxLen) {
  var s = String(value || fallback)
    .replace(/[\\\/\:\*\?\"\<\>\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return s || fallback;
}

/* Constant-time-ish token comparison (avoids early-exit length leaks). */
function tokensMatch_(a, b) {
  var sa = String(a || '');
  var sb = String(b || '');
  if (sa.length !== sb.length) return false;
  var diff = 0;
  for (var i = 0; i < sa.length; i++) {
    diff |= (sa.charCodeAt(i) ^ sb.charCodeAt(i));
  }
  return diff === 0;
}

/* ────────────────────────────── ENTRY POINTS ────────────────────────── */

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return respond(false, 'BUSY');
  }
  try {
    /* Parse body. The client sends Content-Type text/plain to avoid a CORS
       preflight, so read the raw contents and JSON.parse manually. */
    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return respond(false, 'BAD_JSON');
    }

    if (!data || typeof data !== 'object' || !tokensMatch_(data.token, SCRIPT_TOKEN)) {
      return respond(false, 'UNAUTHORIZED');
    }

    var merchantId = String(data.merchantId || '').trim();
    var merchantName = String(data.merchantName || '').trim();
    if (!merchantId) return respond(false, 'MISSING_MERCHANT_ID');

    var files = Array.isArray(data.files) ? data.files : [];
    if (files.length === 0) return respond(false, 'NO_FILES');
    if (files.length > MAX_FILES) return respond(false, 'TOO_MANY_FILES');

    /* Whole-request size guard before touching Drive. */
    var totalBytes = 0;
    for (var v = 0; v < files.length; v++) {
      var ff = files[v] || {};
      totalBytes += Utilities.base64Decode(String(ff.base64 || '')).length;
    }
    if (totalBytes > MAX_TOTAL_BYTES) return respond(false, 'TOTAL_TOO_LARGE');

    var root = getRootFolder_();
    var folder = getOrCreateMerchantFolder_(root, merchantId, merchantName);

    var results = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i] || {};
      var mime = String(f.mimeType || 'application/octet-stream');
      if (!ALLOWED_MIME[mime]) {
        results.push({ docType: f.docType, name: f.name, skipped: true, reason: 'DISALLOWED_MIME' });
        continue;
      }
      results.push(saveFile_(
        folder,
        String(f.docType || ''),
        String(f.label || ''),
        f.name,
        mime,
        f.base64
      ));
    }

    return respond(true, 'DONE', {
      merchantId: merchantId,
      driveFolderId: folder.getId(),
      driveFolderLink: folder.getUrl(),
      files: results
    });
  } catch (err) {
    var msg = (err && err.message) ? err.message : String(err);
    // base64Decode throws on malformed input — surface a clean error.
    if (/base64/i.test(msg)) msg = 'BAD_BASE64';
    return respond(false, 'ERROR: ' + msg);
  } finally {
    lock.releaseLock();
  }
}

/* Friendly status page. Visiting the /exec URL shows config state, not
   stack traces — useful for verifying the deployment works. */
function doGet() {
  return ContentService
    .createTextOutput(
      'Kanjo Ops Drive uploader is running. ' +
      'Configured token: ' + (SCRIPT_TOKEN ? 'yes' : 'NO') + '. ' +
      'Root folder: ' + (ROOT_FOLDER_ID ? 'set' : 'auto (' + ROOT_FOLDER_NAME + ')') + '.'
    )
    .setMimeType(ContentService.MimeType.TEXT);
}

/*****************************************************************************
 * SECURITY NOTES
 *   This endpoint is intentionally NOT a real authorization boundary. The
 *   `SCRIPT_TOKEN` is embedded in the web app's public JS bundle, so anyone
 *   can read it. Its purpose is to stop random Internet traffic and keep the
 *   project tidy. Real access control lives in Firestore security rules, and
 *   document integrity is owned by the Drive account itself:
 *     - the deployed Google account decides who can read/modify the files;
 *     - merchant folders never leave ROOT_FOLDER_ID;
 *     - no destructive operations are exposed by this script.
 *****************************************************************************/
