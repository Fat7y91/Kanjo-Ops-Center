import "server-only";

import puppeteer, { type Browser } from "puppeteer";

/**
 * HTML -> PDF renderer for contract documents.
 *
 * Uses a locally installed Chromium via `puppeteer-core` (executable path from
 * `PUPPETEER_EXECUTABLE_PATH` or the default `puppeteer` download). Page numbers
 * are stamped by Puppeteer's `footerTemplate` because Chromium's `pageNumber`
 * class is the only reliable counter inside a PDF; CSS `@page` counters do not
 * survive Chromium's print pipeline.
 */

let browserPromise: Promise<Browser> | null = null;

/**
 * Resolves the Chromium executable. Operators can point at a system browser via
 * `PUPPETEER_EXECUTABLE_PATH`/`CHROME_PATH`; otherwise the `puppeteer` package's
 * downloaded Chromium is used. `puppeteer-core` alone has no bundled browser, so
 * the `puppeteer` package must be a dependency of the deployment.
 */
function executablePath(): string {
  return (
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_PATH ||
    puppeteer.executablePath()
  );
}

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=none",
      "--no-first-run",
      "--no-zygote",
    ],
    headless: true,
    executablePath: executablePath(),
  });
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      if (browser.connected) return browser;
    } catch {
      /* fall through and relaunch */
    }
    browserPromise = null;
  }
  browserPromise = launchBrowser();
  browserPromise.catch(() => {
    browserPromise = null;
  });
  return browserPromise;
}

export type RenderPdfOptions = {
  headerTemplate: string;
  footerTemplate: string;
};

/** Renders a fully self-contained HTML document to a PDF buffer (A4). */
export async function renderHtmlToPdf(
  html: string,
  options: RenderPdfOptions,
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    page.setDefaultTimeout(90_000);
    await page.setContent(html, {
      waitUntil: ["load", "networkidle0"],
      timeout: 90_000,
    });
    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          /* non-fatal */
        }
      }
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: options.headerTemplate,
      footerTemplate: options.footerTemplate,
      margin: { top: "15mm", right: "15mm", bottom: "18mm", left: "15mm" },
    });
    return Buffer.from(pdf);
  } finally {
    try {
      await page.close();
    } catch {
      /* ignore */
    }
  }
}

/** Drops the cached browser so the next call relaunches (after a crash). */
export function resetPdfBrowser(): void {
  browserPromise = null;
}
