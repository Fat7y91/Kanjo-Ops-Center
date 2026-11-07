import { getContractAssets } from "./assets";
import { escapeHtml } from "./format";

/**
 * Wraps the contract body in a standalone HTML document.
 *
 * Page numbers are NOT set via CSS `@page` counters here: the PDF route uses
 * Puppeteer's `headerTemplate`/`footerTemplate`, which Chromium paginates
 * correctly. The `@page` rule only carries the A4 size and margins.
 */
export function wrapContractDocument(title: string, body: string): string {
  const { fontFaces } = getContractAssets();

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${fontFaces}
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    body {
        direction: rtl;
        text-align: justify;
        font-family: 'Cairo', 'Tahoma', 'Arial', sans-serif;
        line-height: 1.6;
        color: #1e293b;
        font-size: 14px;
    }
    .contract-parties { background-color: #F8F9FA; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px; margin-bottom: 12px; }
    .contract-text { font-size: 12.5px; line-height: 1.7; margin-bottom: 10px; padding-right: 4px; }
    .contract-clause-wrapper { page-break-inside: avoid; break-inside: avoid; margin-bottom: 35px; }
    .contract-clause-title {
        font-size: 13.5px;
        font-weight: 800;
        color: #4B0082;
        background-color: #F5F3FF;
        padding: 6px 10px;
        border-right: 4px solid #F59E0B;
        border-radius: 0 6px 6px 0;
        margin-top: 12px;
        margin-bottom: 7px;
        line-height: 1.5;
    }
    img { max-width: 100%; }
    table { page-break-inside: auto; }
    tr, td, th { page-break-inside: avoid; }

    @page {
        size: A4;
        margin: 15mm 15mm 18mm;
    }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Footer template for Puppeteer. Chromium stamps the page count with its own
 * `pageNumber`/`totalPages` classes, which is the only reliable page counter in
 * a PDF context. Eastern Arabic numerals are applied by the browser font.
 */
export function contractFooterTemplate(): string {
  return `<div style="width: 100%; font-family: 'Cairo', 'Tahoma', Arial, sans-serif; font-size: 10pt; font-weight: 700; color: #4B0082; text-align: center;">
  صفحة <span class="pageNumber"></span> من <span class="totalPages"></span>
</div>`;
}

export function contractHeaderTemplate(): string {
  return `<div style="width: 100%;"></div>`;
}
