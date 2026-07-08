const SQL = require('sql.js');
async function main() {
    const initSqlJs = await SQL();
    const db = new initSqlJs.Database();
    
    db.run('CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
    db.run('INSERT INTO test (name) VALUES (@name)', { '@name': 'First' });
    let r = db.exec('SELECT last_insert_rowid() as id');
    console.log('After first insert:', r[0].values[0][0]);
    
    db.run('INSERT INTO test (name) VALUES (@name)', { '@name': 'Second' });
    r = db.exec('SELECT last_insert_rowid() as id');
    console.log('After second insert:', r[0].values[0][0]);
    
    // Test with export/save
    db.run('INSERT INTO test (name) VALUES (@name)', { '@name': 'Third' });
    const data = db.export();
    r = db.exec('SELECT last_insert_rowid() as id');
    console.log('After export (third):', r[0].values[0][0]);
    
    // Test all rows
    r = db.exec('SELECT * FROM test');
    console.log('All rows:', r[0].values);
}
main();
