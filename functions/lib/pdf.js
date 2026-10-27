'use strict';

/* HTML -> PDF renderer.
 *
 * Uses the serverless-friendly Chromium build from @sparticuz/chromium driven
 * by puppeteer-core, so no browser needs to be bundled in the deployment image.
 * A single browser instance is reused across warm invocations; the launch is
 * lazy because extracting the Chromium binary takes a few hundred milliseconds
 * on a cold start. */

const puppeteer = require('puppeteer-core');

let browserPromise = null;

async function launchBrowser() {
    const chromium = require('@sparticuz/chromium');
    const executablePath = await chromium.executablePath();
    return puppeteer.launch({
        args: [...chromium.args, '--font-render-hinting=none', '--disable-dev-shm-usage'],
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: chromium.headless,
        ignoreHTTPSErrors: true
    });
}

async function getBrowser() {
    if (browserPromise) {
        try {
            const browser = await browserPromise;
            if (browser && browser.connected) return browser;
        } catch (_) {
            /* fall through and relaunch */
        }
        browserPromise = null;
    }
    browserPromise = launchBrowser();
    browserPromise.catch(() => { browserPromise = null; });
    return browserPromise;
}

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/* Localised page numbers, matching the on-screen contract footer. */
function toArabicIndic(value) {
    return String(Math.max(0, Math.trunc(Number(value) || 0)))
        .split('')
        .map((d) => ARABIC_INDIC_DIGITS[Number(d)] || d)
        .join('');
}

/* Count the pages of a Chromium-printed PDF straight from its page tree.
   Chromium writes plain (uncompressed) object streams, so the object headers
   are greppable; the nested /Pages /Count entries are used as a fallback. */
function countPdfPages(buffer) {
    const raw = Buffer.from(buffer).toString('latin1');
    const pageObjects = (raw.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
    if (pageObjects > 0) return pageObjects;
    const counts = [...raw.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1])).filter(Number.isFinite);
    return counts.length ? Math.max(...counts) : 0;
}

/* The cover page is deliberately excluded from the contract numbering: the
   first page of terms must read "صفحة ١ من ٨". The `pages` counter is only
   finalised after pagination, so the totals cannot be calculated in CSS — the
   document is paginated first, then reprinted with the exact total injected. */
function buildPageNumberStyle(totalTermsPages) {
    /* If pagination could not be measured, print the page number alone rather
       than a total that would be visibly wrong (it still counts the cover). */
    const label = totalTermsPages > 0
        ? `"صفحة " counter(page, arabic-indic) " من ${toArabicIndic(totalTermsPages)}"`
        : `"صفحة " counter(page, arabic-indic)`;
    return `
    @page {
        @bottom-center {
            content: ${label};
            font-family: 'Cairo', 'Tahoma', 'Arial', sans-serif;
            font-size: 10pt;
            font-weight: 700;
            color: #4B0082;
            vertical-align: middle;
        }
    }
    @page :first {
        counter-reset: page 0;
        @bottom-center { content: none; }
    }
`;
}

/* Render a fully self-contained HTML document to a PDF buffer with the A4 /
   15-15-18mm page geometry used by the on-screen contract. */
async function renderContractPdf(html) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        page.setDefaultTimeout(90000);
        await page.setContent(html, { waitUntil: ['load', 'networkidle0'], timeout: 90000 });
        await page.evaluate(async () => {
            if (document.fonts && document.fonts.ready) {
                try { await document.fonts.ready; } catch (_) { /* non-fatal */ }
            }
        });

        const pdfOptions = {
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            displayHeaderFooter: false,
            margin: { top: '15mm', right: '15mm', bottom: '18mm', left: '15mm' }
        };

        /* Pass 1 — paginate only (backgrounds skipped, the output is discarded)
           so the exact page count is known before the footer is drawn. */
        const probe = await page.pdf({ ...pdfOptions, printBackground: false });
        const totalPages = countPdfPages(probe);
        const totalTermsPages = totalPages > 1 ? totalPages - 1 : 0;

        /* Pass 2 — append the numbering override after the document's own page
           rules so it wins, then print the final PDF with backgrounds. */
        await page.addStyleTag({ content: buildPageNumberStyle(totalTermsPages) });
        const pdf = await page.pdf(pdfOptions);
        return Buffer.from(pdf);
    } finally {
        try { await page.close(); } catch (_) { /* ignore */ }
    }
}

/* Drop the cached browser so the next call relaunches (used after a crash). */
function resetBrowser() {
    browserPromise = null;
}

module.exports = { renderContractPdf, resetBrowser };
