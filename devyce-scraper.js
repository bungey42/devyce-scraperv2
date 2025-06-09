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

  const baseUrl = 'https://portal.devyce.io/dashboard/live-call-stats';
  let fullData = [];
  let current = 1;
  const maxPages = 10; // cap to avoid infinite loop

  while (current <= maxPages) {
    const url = `${baseUrl}?current=${current}&pageSize=10`;
    await page.goto(url, { waitUntil: 'networkidle2' });
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

    if (!tableData.length) break;
    fullData = fullData.concat(tableData);
    current++;
  }

  // Filter out rows where all call counts and duration are 0
  const filteredData = fullData.filter(row => {
    const fields = ['Inbound calls', 'Outbound calls', 'Total Calls', 'Total Duration'];
    return fields.some(f => row[f] && row[f] !== '0' && row[f] !== '0s' && row[f] !== '0m 0s');
  });

  fs.writeFileSync('call-stats.json', JSON.stringify(filteredData, null, 2));
  console.log('✅ call-stats.json saved');

  const now = new Date();
  if (now.getHours() === 23) {
    const dateStr = now.toISOString().split('T')[0];
    const archiveDir = path.join(__dirname, 'weekly-data');
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir);
    fs.writeFileSync(path.join(archiveDir, `${dateStr}.json`), JSON.stringify(filteredData, null, 2));
    console.log(`📦 Archived daily data to weekly-data/${dateStr}.json`);
  }

  await browser.close();
})();
