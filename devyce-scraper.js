const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  await page.goto('https://portal.devyce.io/login', { waitUntil: 'networkidle2' });

  // Login Step 1: Type email
  await page.waitForSelector('#username', { timeout: 15000 });
  await page.type('#username', process.env.DEVYCE_EMAIL);
  await page.keyboard.press('Enter');

  // Login Step 2: Wait for password field with retry logic
  let passwordAppeared = false;
  for (let i = 0; i < 3; i++) {
    try {
      await page.waitForSelector('#password', { timeout: 7000 });
      passwordAppeared = true;
      break;
    } catch (err) {
      console.warn(`Attempt ${i + 1}: password field not found yet. Retrying...`);
    }
  }

  if (!passwordAppeared) {
    throw new Error('❌ Password field did not appear after multiple attempts.');
  }

  await page.type('#password', process.env.DEVYCE_PASSWORD);
  await page.keyboard.press('Enter');

  // Wait for login to complete
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // Go to the call stats page
  await page.goto('https://portal.devyce.io/dashboard/live-call-stats?current=1&pageSize=10', {
    waitUntil: 'networkidle2',
  });

  // Wait for table
  await page.waitForSelector('table');

  // Extract table data
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

  // Save to file
  fs.writeFileSync('call-stats.json', JSON.stringify(tableData, null, 2));
  console.log('✅ call-stats.json saved');

  await browser.close();
})();
