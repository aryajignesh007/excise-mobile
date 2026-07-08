const XLSX = require('xlsx');
const fs = require('fs');
const TEMPLATE_PATH = 'C:\\Users\\hp\\.openclaw\\media\\inbound\\Latest_template-Inspection---3b730192-628b-4261-9eff-cc3bd8895421.xltx';

// Load the template
const wb = XLSX.readFile(TEMPLATE_PATH, {raw: true});
const ws = wb.Sheets['Sheet1'];
const rows = XLSX.utils.sheet_to_json(ws, {header: 1, defval: ''});

// Parse the inspection fields from Sheet1
// Row format: [field_label, field_value_example]
// Sections are marked by "(N) SectionName"

const sections = [];
let currentSection = 'General';
let order = 0;

rows.forEach((row, i) => {
  const label = String(row[0] || '').trim();
  const example = String(row[1] || '').trim();
  
  // Skip empty rows
  if (!label && !example) return;
  
  // Check if this is a section header
  const sectionMatch = label.match(/^\((\d+)\)\s+(.+)/);
  if (sectionMatch) {
    currentSection = sectionMatch[2].trim();
    return; // Skip the section header row itself
  }
  
  // Skip header/static info rows
  const skipLabels = [
    'Inspection report by Superintendent',
    'Inspection Report Number:',
    'Date of Inspection:',
    'Time of Inspection:',
    'Inspected By:',
    'Name:',
    'Designation:',
    'Department:',
    'Contact:'
  ];
  if (skipLabels.some(s => label.startsWith(s))) return;
  
  order++;
  
  // Determine field type
  let fieldType = 'text';
  let fieldOptions = '';
  
  // Check if it's a yes/no type
  const ynPattern = /Yes|No|Not Applicable/i;
  if (example.match(ynPattern)) {
    fieldType = 'dropdown';
    fieldOptions = JSON.stringify(['Yes', 'No', 'Not Applicable']);
  }
  
  // Check if it's a date
  if (label.toLowerCase().includes('date') || label.toLowerCase().includes('validity')) {
    fieldType = 'date';
  }
  
  sections.push({
    license_type_code: '', // Will be set per license type
    field_label: label.replace(/:$/, '').trim(),
    field_type: fieldType,
    field_options: fieldOptions,
    section_name: currentSection.replace(/:$/, '').trim(),
    field_order: order,
    is_required: 0
  });
});

console.log(`Extracted ${sections.length} fields from template`);
console.log('\nSections found:');
const uniqueSections = [...new Set(sections.map(s => s.section_name))];
uniqueSections.forEach(s => {
  const count = sections.filter(x => x.section_name === s).length;
  console.log(`  ${s}: ${count} fields`);
});

// Generate Excel files for M.A.1 and M.A.2
const licenseTypes = ['M.A.1', 'M.A.2'];
licenseTypes.forEach(lt => {
  const data = sections.map((s, i) => ({
    license_type_code: lt,
    field_label: s.field_label,
    field_type: s.field_type,
    field_options: s.field_options,
    section_name: s.section_name,
    field_order: i + 1,
    is_required: s.is_required
  }));
  
  const outWs = XLSX.utils.json_to_sheet(data);
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, outWs, 'Template');
  
  const outPath = `C:\\Users\\hp\\.openclaw\\workspace\\excise-tool\\data\\template-${lt.replace('.', '-')}.xlsx`;
  XLSX.writeFile(outWb, outPath);
  console.log(`\nCreated: ${outPath} (${data.length} fields)`);
  
  // Also output CSV
  const csvPath = `C:\\Users\\hp\\.openclaw\\workspace\\excise-tool\\data\\template-${lt.replace('.', '-')}.csv`;
  const csv = XLSX.utils.sheet_to_csv(outWs);
  fs.writeFileSync(csvPath, csv);
  console.log(`Created: ${csvPath}`);
});

console.log('\n=== First 10 fields for M.A.1 ===');
const sample = sections.slice(0, 10).map((s, i) => ({
  license_type_code: 'M.A.1',
  field_label: s.field_label,
  field_type: s.field_type,
  section_name: s.section_name,
  field_order: i + 1
}));
console.table(sample);
