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

  let passwordVisible = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await page.waitForSelector('#password', { timeout: 3000 });
      passwordVisible = true;
      break;
    } catch {
      console.log('Waiting for password field...');
    }
  }

  if (!passwordVisible) {
    console.error('Password field did not appear. Exiting.');
    await browser.close();
    return;
  }

  await page.type('#password', process.env.DEVYCE_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  await page.goto('https://portal.devyce.io/dashboard/live-call-stats?current=1&pageSize=10', { waitUntil: 'networkidle2' });
  await page.waitForSelector('table');

  const allData = [];
  let currentPage = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    await page.waitForSelector('table');

    const pageData = await page.evaluate(() => {
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

    allData.push(...pageData);

    const nextBtn = await page.$('button[aria-label="Next Page"]:not([disabled])');
    if (nextBtn) {
      await nextBtn.click();
      await page.waitForTimeout(1500);
      currentPage++;
    } else {
      hasNextPage = false;
    }
  }

  fs.writeFileSync('call-stats.json', JSON.stringify(allData, null, 2));
  console.log('✅ call-stats.json saved');

  const today = new Date().toISOString().split('T')[0];
  if (!fs.existsSync('weekly-data')) fs.mkdirSync('weekly-data');
  fs.writeFileSync(`weekly-data/${today}.json`, JSON.stringify(allData, null, 2));
  console.log(`🗂️  daily archive saved to weekly-data/${today}.json`);

  await browser.close();
})();
