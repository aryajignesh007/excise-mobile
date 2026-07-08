// Test the bulk import flow
const db = require('./src/database/init');
const bulk = require('./src/modules/bulk-import');
const licenseeMgr = require('./src/modules/licensee-manager');

async function main() {
    await db.initAsync();
    
    console.log('Before import:');
    let licensees = db.queryAll('SELECT * FROM licensees ORDER BY name');
    console.log('  Count:', licensees.length);
    
    // Create a test Excel file
    const XLSX = require('xlsx');
    const path = require('path');
    const fs = require('fs');
    
    const testData = [
        { name: 'Test Chemicals Ltd', address: 'Sachin GIDC', gidc_area: 'Sachin', phone: '9999999999', license_type_code: 'FL1' },
        { name: 'Sample Industries', address: 'Pandesara', gidc_area: 'Pandesara', phone: '8888888888', license_type_code: 'FL2' },
        { name: 'Demo Pharma Pvt Ltd', address: 'Hazira', gidc_area: 'Hazira', phone: '7777777777', license_type_code: 'M1' },
    ];
    
    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    
    const testFile = path.join(__dirname, 'test-import.xlsx');
    XLSX.writeFile(wb, testFile);
    console.log('\nTest file created:', testFile);
    
    // Test preview
    try {
        const preview = bulk.previewFile(testFile);
        console.log('\nPreview:', JSON.stringify(preview, null, 2));
    } catch(e) {
        console.log('\nPreview error:', e.message);
    }
    
    // Test import
    try {
        const result = bulk.importFromFile(testFile);
        console.log('\nImport result:', JSON.stringify(result, null, 2));
    } catch(e) {
        console.log('\nImport error:', e.message);
    }
    
    console.log('\nAfter import:');
    licensees = db.queryAll('SELECT * FROM licensees ORDER BY name');
    console.log('  Count:', licensees.length);
    licensees.forEach(l => console.log('  - ID:', l.id, 'Name:', l.name, 'Area:', l.gidc_area, 'Phone:', l.phone, 'Nokarnama:', l.nokarnama_holder));
    
    // Check bulk_imports table
    const imports = db.queryAll('SELECT * FROM bulk_imports ORDER BY import_date DESC');
    console.log('\nImport history:', imports.length);
    imports.forEach(i => console.log('  -', i.filename, i.count_imported, i.status));
    
    // Check licensee_licenses
    const licTypes = db.queryAll('SELECT * FROM license_types');
    console.log('\nLicense types:', licTypes.length);
    licTypes.forEach(lt => console.log('  -', lt.code, '-', lt.id));
    
    const licMaps = db.queryAll('SELECT * FROM licensee_licenses');
    console.log('\nLicensee-License mappings:', licMaps.length);
    licMaps.forEach(m => console.log('  - Licensee ID:', m.licensee_id, 'License Type ID:', m.license_type_id, 'Status:', m.status));
    
    // Cleanup
    fs.unlinkSync(testFile);
    console.log('\nTest file deleted');
    
    db.closeDatabase();
    console.log('\nDatabase closed');
}

main().catch(e => console.error('Fatal:', e));
