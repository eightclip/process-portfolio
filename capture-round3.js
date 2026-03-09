const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const TIMEOUT = 15000;

const domains = [
  { domain: "venicecarnivore.com", name: "Venice Carnivore" },
  { domain: "robitaillesquarters.com", name: "Robitaille's Quarters" },
  { domain: "swftcash.com", name: "SWFT Cash" },
  { domain: "swftsend.com", name: "SWFT Send" },
  { domain: "theanchored.com", name: "The Anchored" }
];

async function capture(browser, d, i) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const urls = [`https://${d.domain}`, `http://${d.domain}`, `https://www.${d.domain}`, `http://www.${d.domain}`];

  for (const url of urls) {
    try {
      console.log(`[${i+1}/${domains.length}] Trying ${url}...`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
      await new Promise(r => setTimeout(r, 2000));

      const title = await page.title();
      const finalUrl = page.url();
      console.log(`  -> OK | Title: ${title} | URL: ${finalUrl}`);

      const pngPath = path.join(SCREENSHOT_DIR, `${d.domain.replace(/\./g, '_')}.png`);
      await page.screenshot({ path: pngPath, type: 'png' });
      console.log(`  -> Screenshot saved`);

      await page.close();
      return { success: true, title, finalUrl };
    } catch (err) {
      console.log(`  -> Failed: ${err.message.split('\n')[0]}`);
    }
  }

  await page.close();
  return { success: false };
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  for (let i = 0; i < domains.length; i++) {
    await capture(browser, domains[i], i);
  }

  await browser.close();
  console.log('\nDone. Now convert PNGs to JPGs.');
}

main().catch(console.error);
