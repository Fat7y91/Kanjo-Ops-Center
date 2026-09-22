'use strict';

/* Bundled, self-contained assets for the contract renderer.
 *
 * Keeping the fonts and the Kanjo logo inside the function bundle means the
 * PDF renderer never depends on the public hosting site being reachable (or on
 * Google Fonts): Arabic shaping and the brand logo render identically on a
 * warm or cold instance. Files are read once and memoised per instance. */

const fs = require('node:fs');
const path = require('node:path');

const ARABIC_UNICODE_RANGE =
    'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, ' +
    'U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC, ' +
    'U+102E0-102FB, U+10E60-10E7E, U+10EC2-10EC4, U+10EFC-10EFF, U+1EE00-1EE03, ' +
    'U+1EE05-1EE1F, U+1EE21-1EE22, U+1EE24, U+1EE27, U+1EE29-1EE32, U+1EE34-1EE37, ' +
    'U+1EE39, U+1EE3B, U+1EE42, U+1EE47, U+1EE49, U+1EE4B, U+1EE4D-1EE4F, U+1EE51-1EE52, ' +
    'U+1EE54, U+1EE57, U+1EE59, U+1EE5B, U+1EE5D, U+1EE5F, U+1EE61-1EE62, U+1EE64, ' +
    'U+1EE67-1EE6A, U+1EE6C-1EE72, U+1EE74-1EE77, U+1EE79-1EE7C, U+1EE7E, U+1EE80-1EE89, ' +
    'U+1EE8B-1EE9B, U+1EEA1-1EEA3, U+1EEA5-1EEA9, U+1EEAB-1EEBB, U+1EEF0-1EEF1';

const LATIN_UNICODE_RANGE =
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, ' +
    'U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, ' +
    'U+FEFF, U+FFFD';

let cached = null;

function readBase64(file) {
    return fs.readFileSync(file).toString('base64');
}

/* Returns the base64 payloads plus ready-to-inject @font-face CSS and the Kanjo
   logo as a data URI. */
function getAssets() {
    if (cached) return cached;
    const dir = path.join(__dirname, '..', 'assets');
    const arabic = readBase64(path.join(dir, 'fonts', 'cairo-arabic.woff2'));
    const latin = readBase64(path.join(dir, 'fonts', 'cairo-latin.woff2'));
    const logo = readBase64(path.join(dir, 'logo.png'));

    const fontFaces = `
@font-face {
    font-family: 'Cairo';
    font-style: normal;
    font-weight: 100 900;
    font-display: block;
    src: url(data:font/woff2;base64,${arabic}) format('woff2');
    unicode-range: ${ARABIC_UNICODE_RANGE};
}
@font-face {
    font-family: 'Cairo';
    font-style: normal;
    font-weight: 100 900;
    font-display: block;
    src: url(data:font/woff2;base64,${latin}) format('woff2');
    unicode-range: ${LATIN_UNICODE_RANGE};
}`;

    cached = {
        logoDataUri: 'data:image/png;base64,' + logo,
        fontFaces
    };
    return cached;
}

module.exports = { getAssets };
