const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto('https://portal.devyce.io/login', { waitUntil: 'networkidle2' });

  // Login sequence with fallback retry for password field
  await page.waitForSelector('#username');
  await page.type('#username', process.env.DEVYCE_EMAIL);
  await page.keyboard.press('Enter');

  let passwordFieldFound = false;
  for (let i = 0; i < 3; i++) {
    try {
      await page.waitForSelector('#password', { timeout: 4000 });
      passwordFieldFound = true;
      break;
    } catch (err) {
      console.log('🔁 Password field not found, retrying...');
    }
  }

  if (!passwordFieldFound) {
    console.error('❌ Password field not found after retries.');
    await browser.close();
    process.exit(1);
  }

  await page.type('#password', process.env.DEVYCE_PASSWORD);
  await page.keyboard.press('Enter');

  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // Navigate to the live call stats page
  await page.goto('https://portal.devyce.io/dashboard/live-call-stats?current=1&pageSize=10', {
    waitUntil: 'networkidle2',
  });

  // Pagination: collect all pages of table data
  let allRows = [];
  let currentPage = 1;

  while (true) {
    await page.waitForSelector('table');

    const rowsOnPage = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('thead th')).map(h => h.innerText.trim());
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const values = cells.map(cell => cell.innerText.trim());
        return headers.reduce((obj, header, i) => {
          obj[header] = values[i] || '';
          return obj;
        }, {});
      });
    });

    allRows = allRows.concat(rowsOnPage);

    const nextBtn = await page.$('button[aria-label="Next Page"]:not([disabled])');
    if (!nextBtn) break;

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      nextBtn.click(),
    ]);
    currentPage++;
  }

  // Save latest data to call-stats.json
  fs.writeFileSync('call-stats.json', JSON.stringify(allRows, null, 2));
  console.log('✅ call-stats.json saved');

  // Also write to weekly-data/YYYY-MM-DD.json
  const outputDir = path.join(__dirname, 'weekly-data');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
  const today = new Date().toISOString().spli
