// Convert Desktop export format to PWA sync format
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'data', 'Excise-DB-Sync.json');
const dst = path.join(__dirname, '..', 'data', 'Excise-DB-Sync-PWA.json');

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));

// PWA expects: data.licensees, data.inspections, data.diaries (not monthly_diaries), data.settings (not app_settings), data.license_types
const pwaExport = {
  version: 2,
  exportedAt: raw.exportedAt || new Date().toISOString(),
  data: {
    licensees: raw.licensees || [],
    inspections: raw.inspections || [],
    diaries: raw.monthly_diaries ? raw.monthly_diaries.map(d => ({
      id: d.id,
      month: d.month,
      year: d.year,
      reference_number: d.reference_number,
      date_text: d.date_text,
      month_name: d.month_name,
      created_at: d.created_at
    })) : [],
    settings: raw.app_settings ? raw.app_settings.map(s => ({
      key: s.key,
      value: s.value
    })) : [],
    license_types: raw.license_types || []
  }
};

fs.writeFileSync(dst, JSON.stringify(pwaExport, null, 2), 'utf8');
console.log('✅ Fixed sync file written to: ' + dst);
console.log('Data summary:');
console.log('  licensees:', pwaExport.data.licensees.length);
console.log('  inspections:', pwaExport.data.inspections.length);
console.log('  diaries:', pwaExport.data.diaries.length);
console.log('  settings:', pwaExport.data.settings.length);
console.log('  license_types:', pwaExport.data.license_types.length);
