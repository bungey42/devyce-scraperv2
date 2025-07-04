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

  // Login
  await page.waitForSelector('#username');
  await page.type('#username', process.env.DEVYCE_EMAIL);
  await page.keyboard.press('Enter');

  // Wait for password field
  let passwordFieldFound = false;
  for (let i = 0; i < 3; i++) {
    try {
      await page.waitForSelector('#password', { timeout: 4000 });
      passwordFieldFound = true;
      break;
    } catch {
      console.log('⏳ Retrying password field detection...');
    }
  }

  if (!passwordFieldFound) {
    console.error('❌ Password field not found');
    await browser.close();
    process.exit(1);
  }

  await page.type('#password', process.env.DEVYCE_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  await page.goto('https://portal.devyce.io/dashboard/live-call-stats?current=1&pageSize=10', {
    waitUntil: 'networkidle2',
  });

  let allRows = [];
  while (true) {
    await page.waitForSelector('table');

const pageRows = await page.evaluate(() => {
  const normalizeHeader = (text) => {
    const h = text.trim().toLowerCase();
    if (h.includes('inbound')) return 'Inbound calls';
    if (h.includes('outbound')) return 'Outbound calls';
    if (h.includes('name')) return 'Name';
    if (h.includes('total calls')) return 'Total Calls';
    if (h.includes('duration')) return 'Total Duration';
    return text.trim();
  };

  const headers = Array.from(document.querySelectorAll('thead th')).map(h =>
    normalizeHeader(h.innerText || '')
  );

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


    allRows = allRows.concat(pageRows);

    const nextBtn = await page.$('button[aria-label="Next Page"]:not([disabled])');
    if (!nextBtn) break;

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      nextBtn.click(),
    ]);
  }

  fs.writeFileSync('call-stats.json', JSON.stringify(allRows, null, 2));
  console.log('✅ Saved call-stats.json');

  const today = new Date().toISOString().split('T')[0];
  const dailyDir = path.join(__dirname, 'weekly-data');
  if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir);
  fs.writeFileSync(path.join(dailyDir, `${today}.json`), JSON.stringify(allRows, null, 2));
  console.log(`📁 Archived to weekly-data/${today}.json`);

  await browser.close();
})();
