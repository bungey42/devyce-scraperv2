const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Step 1: Login
  await page.goto('https://portal.devyce.io/login', { waitUntil: 'networkidle2' });

  await page.waitForSelector('#username');
  await page.type('#username', process.env.DEVYCE_EMAIL);
  await page.keyboard.press('Enter');

  // Retry if password selector doesn't load immediately
  try {
    await page.waitForSelector('#password', { timeout: 10000 });
  } catch {
    await page.keyboard.press('Enter');
    await page.waitForSelector('#password', { timeout: 10000 });
  }

  await page.type('#password', process.env.DEVYCE_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // Step 2: Navigate to stats page
  await page.goto('https://portal.devyce.io/dashboard/live-call-stats?current=1&pageSize=10', {
    waitUntil: 'networkidle2'
  });

  const allData = [];

  while (true) {
    await page.waitForSelector('table');

    const pageData = await page.evaluate(() => {
      const desiredHeaders = ['User', 'Inbound', 'Outbound', 'Total Calls', 'Total Duration'];
      const table = document.querySelector('table');
      const headerCells = Array.from(table.querySelectorAll('thead th'));

      const headerIndexes = headerCells.reduce((acc, th, idx) => {
        const text = th.innerText.trim();
        if (desiredHeaders.includes(text)) {
          acc[text] = idx;
        }
        return acc;
      }, {});

      const rows = Array.from(table.querySelectorAll('tbody tr'));

      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        return {
          'Name': cells[headerIndexes['User']]?.innerText.trim() || '',
          'Inbound calls': cells[headerIndexes['Inbound']]?.innerText.trim() || '',
          'Outbound calls': cells[headerIndexes['Outbound']]?.innerText.trim() || '',
          'Total Calls': cells[headerIndexes['Total Calls']]?.innerText.trim() || '',
          'Total Duration': cells[headerIndexes['Total Duration']]?.innerText.trim() || '',
        };
      });
    });

    allData.push(...pageData);

    // Try to paginate
    const nextButton = await page.$('ul.pagination li:last-child button:not(:disabled)');
    if (!nextButton) break;

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      nextButton.click(),
    ]);
  }

  fs.writeFileSync('call-stats.json', JSON.stringify(allData, null, 2));
  console.log(`✅ Scraped ${allData.length} rows to call-stats.json`);

  await browser.close();
})();
