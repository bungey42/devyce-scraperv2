const puppeteer = require('puppeteer');
const fs = require('fs');

function normalizeHeader(header) {
  switch (header.trim()) {
    case 'User':
      return 'Name';
    case 'Outbound':
      return 'Outbound calls';
    case 'Inbound':
      return 'Inbound calls';
    case 'Total Calls':
      return 'Total Calls';
    case 'Total Duration':
      return 'Total Duration';
    default:
      return null; // ignore all other columns
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Login
  await page.goto('https://portal.devyce.io/login', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#username');
  await page.type('#username', process.env.DEVYCE_EMAIL);
  await page.keyboard.press('Enter');

  // Retry waiting for password input if delayed
  try {
    await page.waitForSelector('#password', { timeout: 10000 });
  } catch {
    await page.keyboard.press('Enter'); // trigger render again
    await page.waitForSelector('#password', { timeout: 10000 });
  }

  await page.type('#password', process.env.DEVYCE_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // Navigate to live stats
  await page.goto(
    'https://portal.devyce.io/dashboard/live-call-stats?current=1&pageSize=10',
    { waitUntil: 'networkidle2' }
  );

  let allData = [];

  while (true) {
    await page.waitForSelector('table');
    const pageData = await page.evaluate(() => {
      const normalizeHeader = (header) => {
        switch (header.trim()) {
          case 'User':
            return 'Name';
          case 'Outbound':
            return 'Outbound calls';
          case 'Inbound':
            return 'Inbound calls';
          case 'Total Calls':
            return 'Total Calls';
          case 'Total Duration':
            return 'Total Duration';
          default:
            return null;
        }
      };

      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      const rawHeaders = Array.from(document.querySelectorAll('table thead th')).map(h => h.innerText.trim());
      const headers = rawHeaders.map(normalizeHeader).filter(Boolean);

      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const values = cells.map(cell => cell.innerText.trim());
        return headers.reduce((obj, header, index) => {
          obj[header] = values[index] || '';
          return obj;
        }, {});
      });
    });

    allData = allData.concat(pageData);

    // Try to click the "next" button if it's not disabled
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
