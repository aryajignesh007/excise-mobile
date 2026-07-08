const db = require('./src/database/init');
(async () => {
  await db.initAsync();
  console.log('DB OK');
  try {
    const lic = db.queryAll('SELECT * FROM licensees');
    console.log('Licensees:', lic.length);
  } catch(e) { console.log('Licensees error:', e.message); }
  try {
    const types = db.queryAll('SELECT * FROM license_types');
    console.log('Types:', types.length);
  } catch(e) { console.log('Types error:', e.message); }
  db.closeDatabase();
})();
