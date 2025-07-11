const fs = require('fs');
const path = require('path');

const archiveDir = path.join(__dirname, 'weekly-data');
const summaryFile = path.join(__dirname, 'weekly-summary.json');
const liveDataFile = path.join(__dirname, 'call-stats.json');

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

function addToWeekData(data) {
  data.forEach(row => {
    const key = row['Name'] || row['Users'];
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

    weekData[key]['Inbound calls'] += safeParse(row['Inbound calls'] || row['Inbound Calls'] || '0');
    weekData[key]['Outbound calls'] += safeParse(row['Outbound calls'] || row['Outbound Calls'] || '0');
    weekData[key]['Total Calls'] += safeParse(row['Total Calls'] || '0');
    weekData[key]['Total Duration Seconds'] += parseDuration(row['Total Duration'] || '0s');
  });
}

// Step 1: Add each archived weekday file
files.forEach(file => {
  const filePath = path.join(archiveDir, file);
  const data = readJSON(filePath);
  addToWeekData(data);
});

// Step 2: Also add today's current data from call-stats.json
if (fs.existsSync(liveDataFile)) {
  const liveData = readJSON(liveDataFile).data || [];
  const today = new Date().toISOString().split('T')[0];

  // Only add live data if today is Mon–Fri
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    console.log('📅 Adding today\'s live data to weekly summary...');
    addToWeekData(liveData);
  }
}

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
