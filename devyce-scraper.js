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

  await page.waitForSelector('#password', { timeout: 10000 });
  await page.type('#password', process.env.DEVYCE_PASSWORD);
  await page.keyboard.press('Enter');

  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  await page.goto('https://portal.devyce.io/dashboard/live-call-stats?current=1&pageSize=10', {
    waitUntil: 'networkidle2',
  });

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

  fs.writeFileSync('call-stats.json', JSON.stringify(tableData, null, 2));
  console.log('✅ call-stats.json saved');
  await browser.close();
})();
