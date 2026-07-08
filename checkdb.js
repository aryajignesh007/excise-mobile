const SQL = require('sql.js');
const fs = require('fs');
const path = require('path');

const distDb = path.join(__dirname, 'dist', 'win-unpacked', 'resources', 'app', 'data', 'excise_inspections.db');
const sourceDb = path.join(__dirname, 'data', 'excise_inspections.db');

async function inspect(label, dbPath) {
    console.log('\n=== ' + label + ' ===');
    if (!fs.existsSync(dbPath)) { console.log('FILE NOT FOUND:', dbPath); return; }
    const buf = fs.readFileSync(dbPath);
    const SQLlib = await SQL();
    const db = new SQLlib.Database(buf);
    
    const lic = db.exec('SELECT id, name, phone FROM licensees ORDER BY id');
    console.log('Licensees:', lic[0] ? lic[0].values.length + ' rows' : 'TABLE MISSING');
    if (lic[0]) lic[0].values.forEach(v => console.log('  ' + v[0] + ': ' + v[1] + ' (' + v[2] + ')'));
    
    const imp = db.exec('SELECT * FROM bulk_imports ORDER BY import_date DESC');
    console.log('Bulk imports:', imp[0] ? imp[0].values.length + ' rows' : 'TABLE MISSING');
    if (imp[0]) imp[0].values.forEach(v => console.log('  File: ' + v[1] + ', Count: ' + v[3] + ', Status: ' + v[4]));
    
    const sch = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='vehicle_master'");
    console.log('vehicle_master:', sch[0] ? 'EXISTS' : 'MISSING');
    
    if (sch[0]) {
        const veh = db.exec('SELECT * FROM vehicle_master');
        console.log('Vehicles:', veh[0] ? veh[0].values.length : 0);
    }
    
    const ft = db.exec('SELECT * FROM form_templates LIMIT 3');
    console.log('form_templates:', ft[0] ? ft[0].values.length + ' rows' : 'TABLE MISSING');
}

(async () => {
    await inspect('DIST DB', distDb);
    await inspect('SOURCE DB', sourceDb);
})();
