// archive-summary.js
const fs = require('fs');
const path = require('path');

const archiveDir = path.join(__dirname, 'weekly-data');
const summaryFile = path.join(__dirname, 'weekly-summary.json');

function getWeekStartDate(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
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
  return day >= 1 && day <= 5; // Mon–Fri
}

const files = fs.readdirSync(archiveDir)
  .filter(file => file.endsWith('.json') && isWeekday(file));

const thisWeek = getWeekStartDate(new Date());
const weekData = {};

files.forEach(file => {
  const filePath = path.join(archiveDir, file);
  const data = readJSON(filePath);

  data.forEach(row => {
    const key = row['Name'];
    if (!key) return;

    if (!weekData[key]) {
      weekData[key] = {
        'Name': key,
        'Inbound calls': 0,
        'Outbound calls': 0,
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

    weekData[key]['Inbound calls'] += safeParse(row['Inbound calls']);
    weekData[key]['Outbound calls'] += safeParse(row['Outbound calls']);
    weekData[key]['Total Calls'] += safeParse(row['Total Calls']);
    weekData[key]['Total Duration Seconds'] += parseDuration(row['Total Duration']);
  });
});

// Format back to standard output
const summary = Object.values(weekData).map(entry => {
  const totalSeconds = entry['Total Duration Seconds'];
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return {
    'Name': entry['Name'],
    'Inbound calls': entry['Inbound calls'],
    'Outbound calls': entry['Outbound calls'],
    'Total Calls': entry['Total Calls'],
    'Total Duration': `${h}h ${m}m ${s}s`
  };
});

fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
console.log(`✅ Weekly summary saved to weekly-summary.json (${summary.length} entries)`);
