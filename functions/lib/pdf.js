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
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            displayHeaderFooter: false,
            margin: { top: '15mm', right: '15mm', bottom: '18mm', left: '15mm' }
        });
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
