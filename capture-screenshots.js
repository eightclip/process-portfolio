const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const domains = require('./domains.json').all;
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const RESULTS_FILE = path.join(__dirname, 'scan-results.json');
const TIMEOUT = 15000;

async function captureDomain(browser, domain, index) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const result = {
    domain: domain.domain,
    name: domain.name,
    knownForward: domain.forward,
    status: 'unknown',
    finalUrl: null,
    screenshotFile: null,
    error: null,
    title: null
  };

  try {
    const url = `https://${domain.domain}`;
    console.log(`[${index + 1}/${domains.length}] Visiting ${url}...`);

    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: TIMEOUT
    });

    // Wait a moment for any animations/loading
    await new Promise(r => setTimeout(r, 1500));

    result.finalUrl = page.url();
    result.title = await page.title();

    const statusCode = response ? response.status() : null;

    // Detect if it redirected to another domain
    const finalHostname = new URL(result.finalUrl).hostname.replace('www.', '');
    const originalHostname = domain.domain.replace('www.', '');
    const isRedirect = finalHostname !== originalHostname;

    // Detect parking pages / dead sites
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
    const isParked = /buy this domain|domain is for sale|parked|coming soon|under construction|this site can't be reached|page not found|squarespace.*expired/i.test(bodyText);
    const isSquarespaceDefault = /website coming soon/i.test(bodyText);

    if (isRedirect) {
      result.status = 'redirect';
      result.redirectTo = finalHostname;
    } else if (isParked || isSquarespaceDefault) {
      result.status = 'parked';
    } else if (statusCode >= 400) {
      result.status = 'error';
    } else {
      result.status = 'live';
    }

    // Take screenshot regardless
    const screenshotName = `${domain.domain.replace(/\./g, '_')}.png`;
    const screenshotPath = path.join(SCREENSHOT_DIR, screenshotName);
    await page.screenshot({ path: screenshotPath, type: 'png' });
    result.screenshotFile = `screenshots/${screenshotName}`;

    console.log(`  -> ${result.status} | Final: ${result.finalUrl} | Title: ${result.title}`);
  } catch (err) {
    result.status = 'error';
    result.error = err.message;
    console.log(`  -> ERROR: ${err.message}`);

    // Try http:// as fallback
    try {
      const httpUrl = `http://${domain.domain}`;
      console.log(`  -> Trying HTTP fallback: ${httpUrl}`);
      const response = await page.goto(httpUrl, {
        waitUntil: 'networkidle2',
        timeout: TIMEOUT
      });
      await new Promise(r => setTimeout(r, 1500));

      result.finalUrl = page.url();
      result.title = await page.title();

      const finalHostname = new URL(result.finalUrl).hostname.replace('www.', '');
      const originalHostname = domain.domain.replace('www.', '');
      const isRedirect = finalHostname !== originalHostname;

      if (isRedirect) {
        result.status = 'redirect';
        result.redirectTo = finalHostname;
      } else {
        result.status = 'live';
      }

      const screenshotName = `${domain.domain.replace(/\./g, '_')}.png`;
      const screenshotPath = path.join(SCREENSHOT_DIR, screenshotName);
      await page.screenshot({ path: screenshotPath, type: 'png' });
      result.screenshotFile = `screenshots/${screenshotName}`;
      result.error = null;

      console.log(`  -> HTTP fallback: ${result.status} | ${result.finalUrl}`);
    } catch (err2) {
      console.log(`  -> HTTP fallback also failed: ${err2.message}`);
    }
  } finally {
    await page.close();
  }

  return result;
}

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log(`Scanning ${domains.length} domains...\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];

  // Process 3 at a time for speed
  const CONCURRENCY = 3;
  for (let i = 0; i < domains.length; i += CONCURRENCY) {
    const batch = domains.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((d, j) => captureDomain(browser, d, i + j))
    );
    results.push(...batchResults);
  }

  await browser.close();

  // Categorize
  const live = results.filter(r => r.status === 'live');
  const comingSoon = results.filter(r => r.status !== 'live');

  const output = { live, comingSoon, scanDate: new Date().toISOString() };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2));

  console.log(`\n=== SCAN COMPLETE ===`);
  console.log(`Live sites: ${live.length}`);
  console.log(`Coming soon / redirects / errors: ${comingSoon.length}`);
  console.log(`Results saved to ${RESULTS_FILE}`);
}

main().catch(console.error);
