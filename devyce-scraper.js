// devyce-scraper.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  await page.goto('https://portal.devyce.io/login', { waitUntil: 'networkidle2' });

  await page.waitForSelector('#username');
  await page.type('#username', process.env.DEVYCE_EMAIL);
  await page.keyboard.press('Enter');

  // Retry password selector
  let passwordLoaded = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await page.waitForSelector('#password', { timeout: 3000 });
      passwordLoaded = true;
      break;
    } catch (e) {
      console.log(`Password field not loaded yet, retrying (${attempt + 1}/5)...`);
    }
  }

  if (!passwordLoaded) {
    console.error('❌ Failed to load password field');
    await browser.close();
    process.exit(1);
  }

  await page.type('#password', process.env.DEVYCE_PASSWORD);
  await page.keyboard.press('Enter');

  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  await page.goto('https://portal.devyce.io/dashboard/live-call-stats?current=1&pageSize=10', {
    waitUntil: 'networkidle2',
  });

  // Grab all table pages
  let fullData = [];
  let hasNextPage = true;
  let currentPage = 1;

  while (hasNextPage) {
    await page.waitForSelector('table');

    const tableData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      const headers = Array.from(document.querySelectorAll('table thead th')).map(h => h.innerText.trim());

      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const values = cells.map(cell => cell.innerText.trim());
        return headers.reduce((obj, header, index) => {
          obj[header] = values[index] || '';
          return obj;
        }, {});
      });
    });

    fullData = fullData.concat(tableData);

    const nextBtn = await page.$('button[aria-label="Next page"]:not([disabled])');
    if (nextBtn) {
      await nextBtn.click();
      await page.waitForTimeout(1500); // Wait for the next page to load
      currentPage++;
    } else {
      hasNextPage = false;
    }
  }

  fs.writeFileSync('call-stats.json', JSON.stringify(fullData, null, 2));
  console.log('✅ call-stats.json saved');

  // Archive daily snapshot at 11pm
  const now = new Date();
  if (now.getHours() === 23) {
    const dateStr = now.toISOString().split('T')[0];
    const archiveDir = path.join(__dirname, 'weekly-data');
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir);
    fs.writeFileSync(path.join(archiveDir, `${dateStr}.json`), JSON.stringify(fullData, null, 2));
    console.log(`📦 Archived daily data to weekly-data/${dateStr}.json`);
  }

  await browser.close();
})();
