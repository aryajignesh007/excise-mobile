#!/usr/bin/env node

/**
 * Excise Inspection Management System
 * Superintendent of Prohibition and Excise, Surat
 * 
 * Command-line interface for testing core functionality.
 * Full EXE with GUI will be built with Electron.
 */

const db = require('./src/database/init');
const licenseeManager = require('./src/modules/licensee-manager');
const licenseTypeManager = require('./src/modules/license-type-manager');
const inspectionManager = require('./src/modules/inspection-manager');
const diaryGenerator = require('./src/modules/diary-generator');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  Excise Inspection Management System v1.0');
    console.log('  Superintendent, Prohibition & Excise');
    console.log('  Surat');
    console.log('═══════════════════════════════════════════\n');

    // Initialize database (async for sql.js)
    await db.initAsync();

    switch (command) {
        case 'init-db':
            console.log('✓ Database initialized successfully');
            console.log('  Location: data/excise_inspections.db');
            break;

        case 'import-licenses':
            const licensesFile = args[1] || path.join(__dirname, '..', '..', 'media', 'inbound', 
                'List_of_Licenses---34c6c067-aaef-4d72-9782-b45e44dee3d5.xlsx');
            if (fs.existsSync(licensesFile)) {
                const count = licenseTypeManager.importFromExcel(licensesFile);
                console.log(`✓ Imported ${count} license types`);
            } else {
                console.log('✗ File not found:', licensesFile);
            }
            break;

        case 'add-licensee':
            const id = licenseeManager.addLicensee({
                name: args[1] || 'Test Licensee',
                address: args[2] || 'Sachin GIDC',
                gidc_area: args[3] || 'Sachin GIDC',
                contact_person: args[4] || 'Test Person',
                nokarnama_holder: 'Yes',
                is_priority: true
            });
            console.log(`✓ Added licensee ID: ${id}`);
            break;

        case 'list-licensees':
            const licensees = licenseeManager.getAllLicensees();
            console.log(`Total licensees: ${licensees.length}`);
            licensees.forEach(l => {
                console.log(`  [${l.id}] ${l.name} - ${l.gidc_area} ${l.is_priority ? '⭐' : ''}`);
            });
            break;

        case 'generate-diary':
            const month = parseInt(args[1]) || 7;
            const year = parseInt(args[2]) || 2025;
            console.log(`Generating diary for ${month}/${year}...`);
            
            const diary = diaryGenerator.generateDiary(month, year);
            console.log(`✓ Diary generated (ID: ${diary.id})`);
            console.log(`  Month: ${diary.monthName}`);
            console.log(`  Daily entries: ${diary.dailyEntries.length}`);
            console.log(`  Summary items: ${diary.summary.length}`);
            console.log(`  Abstract items: ${diary.abstract.filter(a => !a.isHeader).length}`);
            
            // Export to Word
            try {
                const docxFile = await diaryGenerator.exportToDocx(diary);
                console.log(`✓ Word document saved: ${docxFile}`);
            } catch (e) {
                console.log('✗ Word export error:', e.message);
                console.log('  (docx library may not be fully loaded)');
            }
            break;

        case 'view-diary':
            const m = parseInt(args[1]) || 7;
            const y = parseInt(args[2]) || 2025;
            const existing = diaryGenerator.getDiary(m, y);
            if (existing) {
                console.log(`Diary: ${existing.month_name} (${existing.month}/${existing.year})`);
                console.log(`Reference: ${existing.reference_number}`);
                console.log(`Entries: ${existing.entries.length}`);
                console.log(`\nFirst few entries:`);
                existing.entries.slice(0, 5).forEach(e => {
                    console.log(`  ${e.entry_date}: ${e.work_description?.substring(0, 60)}`);
                });
            } else {
                console.log('No diary found for this month. Generate one first.');
            }
            break;

        case 'list-types':
            const types = licenseTypeManager.getAll();
            const grouped = licenseTypeManager.getByCategory();
            for (const [cat, items] of Object.entries(grouped)) {
                console.log(`\n${cat}:`);
                items.forEach(t => console.log(`  ${t.code} (${t.total_count || '?'})`));
            }
            break;

        case 'help':
        default:
            console.log('Commands:');
            console.log('  init-db                    Initialize database');
            console.log('  import-licenses [file]     Import license types from Excel');
            console.log('  add-licensee               Add a test licensee');
            console.log('  list-licensees             List all licensees');
            console.log('  generate-diary [m] [y]     Generate diary for month/year');
            console.log('  view-diary [m] [y]         View existing diary');
            console.log('  list-types                 List all license types');
            break;
    }
}

main().catch(console.error);
