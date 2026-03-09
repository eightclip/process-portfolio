const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const RESULTS_FILE = path.join(__dirname, 'scan-results.json');
const TIMEOUT = 15000;

const extras = [
  { domain: "games.gate14.net", name: "Gate 14 Games" },
  { domain: "alfred.gate14.net", name: "Alfred (Gate 14)" },
  { domain: "gate14-daily-stats.pages.dev", name: "Gate 14 Daily Stats" },
  { domain: "long-on-stables.pages.dev", name: "Long On Stables" },
  { domain: "stabltradl.pages.dev", name: "StablTradl" },
  { domain: "hardcorenicknames.pages.dev", name: "Hardcore Nicknames" },
  { domain: "stblphoria.pages.dev", name: "STBLphoria" },
  { domain: "stblr.pages.dev", name: "STBLR App" }
];

async function captureDomain(browser, domain, index) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const result = {
    domain: domain.domain,
    name: domain.name,
    status: 'unknown',
    finalUrl: null,
    screenshotFile: null,
    error: null,
    title: null
  };

  try {
    const url = `https://${domain.domain}`;
    console.log(`[${index + 1}/${extras.length}] Visiting ${url}...`);

    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: TIMEOUT
    });

    await new Promise(r => setTimeout(r, 2000));

    result.finalUrl = page.url();
    result.title = await page.title();

    const finalHostname = new URL(result.finalUrl).hostname.replace('www.', '');
    const originalHostname = domain.domain.replace('www.', '');
    const isRedirect = finalHostname !== originalHostname;

    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
    const isParked = /buy this domain|domain is for sale|parked|coming soon|under construction|this site can't be reached|page not found/i.test(bodyText);

    if (isRedirect) {
      result.status = 'redirect';
      result.redirectTo = finalHostname;
    } else if (isParked) {
      result.status = 'parked';
    } else {
      result.status = 'live';
    }

    const screenshotName = `${domain.domain.replace(/\./g, '_')}.jpg`;
    const screenshotPath = path.join(SCREENSHOT_DIR, screenshotName);

    // Take PNG first then we'll convert
    const pngPath = screenshotPath.replace('.jpg', '.png');
    await page.screenshot({ path: pngPath, type: 'png' });
    result.screenshotFile = `screenshots/${screenshotName}`;

    console.log(`  -> ${result.status} | Title: ${result.title}`);
  } catch (err) {
    result.status = 'error';
    result.error = err.message;
    console.log(`  -> ERROR: ${err.message}`);
  } finally {
    await page.close();
  }

  return result;
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];
  for (let i = 0; i < extras.length; i++) {
    const r = await captureDomain(browser, extras[i], i);
    results.push(r);
  }

  await browser.close();

  // Load existing results and merge
  const existing = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));

  for (const r of results) {
    if (r.status === 'live') {
      existing.live.push(r);
    } else {
      existing.comingSoon.push(r);
    }
  }

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(existing, null, 2));

  const live = results.filter(r => r.status === 'live');
  const other = results.filter(r => r.status !== 'live');
  console.log(`\nDone. ${live.length} live, ${other.length} coming soon.`);
  console.log(`Total: ${existing.live.length} live, ${existing.comingSoon.length} coming soon.`);
}

main().catch(console.error);
