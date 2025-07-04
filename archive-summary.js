// archive-summary.js
const fs = require('fs');
const path = require('path');

const archiveDir = path.join(__dirname, 'weekly-data');
const summaryFile = path.join(__dirname, 'weekly-summary.json');

if (!fs.existsSync(archiveDir)) {
  console.log('📂 weekly-data directory does not exist. Skipping summary generation.');
  fs.writeFileSync(summaryFile, JSON.stringify([], null, 2));
  process.exit(0);
}

function getWeekStartDate(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`❌ Failed to read ${filePath}`);
    return [];
  }
}

function isWeekday(fileName) {
  const date = new Date(fileName.replace('.json', ''));
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

const files = fs.readdirSync(archiveDir)
  .filter(file => file.endsWith('.json') && isWeekday(file));

const thisWeek = getWeekStartDate(new Date());
const weekData = {};

files.forEach(file => {
  const filePath = path.join(archiveDir, file);
  const data = readJSON(filePath);

  data.forEach(row => {
    const key = row['Users'] || row['Name'];
    if (!key) return;

    if (!weekData[key]) {
      weekData[key] = {
        'Users': key,
        'Inbound Calls': 0,
        'Outbound Calls': 0,
        'Total Calls': 0,
        'Total Duration Seconds': 0,
      };
    }

    const safeParse = (val) => parseInt(val.replace(/[^0-9]/g, '') || '0');
    const parseDuration = (str) => {
      let h = 0, m = 0, s = 0;
      if (/\d+h/.test(str)) h = parseInt(str.match(/(\d+)h/)[1]);
      if (/\d+m/.test(str)) m = parseInt(str.match(/(\d+)m/)[1]);
      if (/\d+s/.test(str)) s = parseInt(str.match(/(\d+)s/)[1]);
      return h * 3600 + m * 60 + s;
    };

    weekData[key]['Inbound Calls'] += safeParse(row['Inbound Calls'] || row['Inbound calls'] || '0');
    weekData[key]['Outbound Calls'] += safeParse(row['Outbound Calls'] || row['Outbound calls'] || '0');
    weekData[key]['Total Calls'] += safeParse(row['Total Calls'] || '0');
    weekData[key]['Total Duration Seconds'] += parseDuration(row['Total Duration'] || '0s');
  });
});

const summary = Object.values(weekData).map(entry => {
  const totalSeconds = entry['Total Duration Seconds'];
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return {
    'Users': entry['Users'],
    'Inbound Calls': entry['Inbound Calls'],
    'Outbound Calls': entry['Outbound Calls'],
    'Total Calls': entry['Total Calls'],
    'Total Duration': `${h}h ${m}m ${s}s`
  };
});

fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
console.log(`✅ Weekly summary saved to weekly-summary.json (${summary.length} entries)`);
