const puppeteer = require('puppeteer');
const fs = require('fs');

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

  try {
    await page.waitForSelector('#password', { timeout: 10000 });
  } catch {
    await page.keyboard.press('Enter');
    await page.waitForSelector('#password', { timeout: 10000 });
  }

  await page.type('#password', process.env.DEVYCE_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  await page.goto('https://portal.devyce.io/dashboard/live-call-stats?current=1&pageSize=10', {
    waitUntil: 'networkidle2'
  });

  const allData = [];

  while (true) {
    await page.waitForSelector('table');

    const pageData = await page.evaluate(() => {
      const requiredHeaders = {
        'Name': 'User',
        'Inbound calls': 'Inbound',
        'Outbound calls': 'Outbound',
        'Total Calls': 'Total Calls',
        'Total Duration': 'Total Duration',
      };

      const table = document.querySelector('table');
      const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());

      const indexes = {};
      for (const [key, headerName] of Object.entries(requiredHeaders)) {
        indexes[key] = headers.findIndex(h => h === headerName);
      }

      const rows = Array.from(table.querySelectorAll('tbody tr'));
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        return {
          'Name': cells[indexes['Name']]?.innerText.trim() || '',
          'Inbound calls': cells[indexes['Inbound calls']]?.innerText.trim() || '',
          'Outbound calls': cells[indexes['Outbound calls']]?.innerText.trim() || '',
          'Total Calls': cells[indexes['Total Calls']]?.innerText.trim() || '',
          'Total Duration': cells[indexes['Total Duration']]?.innerText.trim() || '',
        };
      });
    });

    allData.push(...pageData);

    const nextBtn = await page.$('ul.pagination li:last-child button:not(:disabled)');
    if (!nextBtn) break;

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      nextBtn.click(),
    ]);
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    data: allData
  };

  fs.writeFileSync('call-stats.json', JSON.stringify(output, null, 2));
  console.log(`✅ Saved ${allData.length} entries to call-stats.json`);

  // NEW: Archive today's data into weekly-data/YYYY-MM-DD.json
  const archiveDir = './weekly-data';
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir);
  }
  const today = new Date().toISOString().split('T')[0];
  fs.writeFileSync(`${archiveDir}/${today}.json`, JSON.stringify(allData, null, 2));
  console.log(`📦 Archived daily data to ${archiveDir}/${today}.json`);

  await browser.close();
})();
