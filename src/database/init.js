const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'excise_inspections.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;
let SQL = null;
let isInitialized = false;

async function initSqlJsModule() {
    if (SQL) return SQL;
    // sql.js is an ESM module, so we use dynamic import
    const initSqlJs = require('sql.js');
    SQL = await initSqlJs();
    return SQL;
}

async function getDatabase() {
    if (db && isInitialized) return db;
    
    await initSqlJsModule();
    
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    
    // Load existing DB or create new one
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }
    
    // Run schema
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.run(schema);
    
    // Run schema migrations (safe ALTER TABLE - ignore errors if column already exists)
    const migrations = [
        "ALTER TABLE inspections ADD COLUMN report_content TEXT"
    ];
    for (const migration of migrations) {
        try {
            db.run(migration);
        } catch (e) {
            // Column likely already exists - this is fine
        }
    }
    
    // Auto-save to disk
    saveDatabase();
    
    isInitialized = true;
    return db;
}

function saveDatabase() {
    if (!db) return;
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        const dbDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        fs.writeFileSync(DB_PATH, buffer);
    } catch (e) {
        console.error('Error saving database:', e.message);
    }
}

function closeDatabase() {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
        isInitialized = false;
    }
}

// Normalize params for sql.js binding
// sql.js expects @ prefix in object keys for named params like @name
function normalizeParams(params) {
    if (!params || Array.isArray(params)) return params;
    if (typeof params !== 'object') return params;
    const normalized = {};
    for (const [key, val] of Object.entries(params)) {
        // If the key doesn't start with @, :, or $, add @ prefix (sql.js convention)
        if (key.startsWith('@') || key.startsWith(':') || key.startsWith('$')) {
            normalized[key] = val;
        } else if (key === key.toUpperCase() && key.length <= 2) {
            // Short uppercase keys (like m, y) — add @ prefix
            normalized['@' + key] = val;
        } else {
            normalized['@' + key] = val;
        }
    }
    return normalized;
}

// Helper: run query and get all results
function queryAll(sql, params) {
    if (!db) throw new Error('Database not initialized. Call getDatabase() first.');
    const stmt = db.prepare(sql);
    if (stmt) {
        const bound = normalizeParams(params);
        if (bound !== undefined) stmt.bind(bound);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
    }
    return [];
}

// Helper: run query and get first result
function queryOne(sql, params) {
    const rows = queryAll(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

// Helper: run insert/update/delete
function run(sql, params) {
    if (!db) throw new Error('Database not initialized. Call getDatabase() first.');
    const bound = normalizeParams(params);
    db.run(sql, bound);
    saveDatabase();
    return { changes: db.getRowsModified() };
}

// Helper: insert and return last ID
function insert(sql, params) {
    if (!db) throw new Error('Database not initialized. Call getDatabase() first.');
    const bound = normalizeParams(params);
    db.run(sql, bound);
    // IMPORTANT: Get last_insert_rowid BEFORE saveDatabase/export,
    // because db.export() resets last_insert_rowid() to 0 in sql.js
    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
    saveDatabase();
    return Number(id);
}

// Initialize database synchronously for use in Electron main process startup
function initSync() {
    // This will be called from the main process
    // For sql.js, initialization is async, so we defer
    return { ready: false };
}

// Async initialization wrapper
async function initAsync() {
    await getDatabase();
    return { ready: true };
}

module.exports = {
    getDatabase,
    closeDatabase,
    queryAll,
    queryOne,
    run,
    insert,
    initSync,
    initAsync,
    saveDatabase
};
