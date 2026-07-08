const db = require('../database/init');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

class BulkImport {
    /**
     * Import licensees + license types from an Excel/CSV file
     * Expected columns: name, address, gidc_area, phone, email, contact_person,
     *                   nokarnama_holder, is_priority, license_type_code, license_number
     * Returns { imported: count, skipped: count, errors: [...] }
     */
    importFromFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.xlsx' && ext !== '.xls' && ext !== '.csv') {
            throw new Error('ફક્ત Excel (.xlsx/.xls) અથવા CSV (.csv) ફાઇલો સપોર્ટેડ છે.');
        }

        let wb;
        if (ext === '.csv') {
            // Read CSV
            const csvData = fs.readFileSync(filePath, 'utf8');
            wb = XLSX.read(csvData, { type: 'string', raw: true });
        } else {
            wb = XLSX.readFile(filePath, { raw: true });
        }

        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        
        // Convert to array of objects (header row -> column names)
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        
        if (!rows || rows.length === 0) {
            throw new Error('ફાઇલમાં કોઈ ડેટા નથી.');
        }

        // Normalize column names (lowercase, trim, replace spaces with underscores)
        const normalizedRows = rows.map(row => {
            const normalized = {};
            for (const [key, val] of Object.entries(row)) {
                const normKey = key.trim().toLowerCase()
                    .replace(/[^a-z0-9_]/g, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_|_$/g, '');
                normalized[normKey] = val;
            }
            return normalized;
        });

        let imported = 0;
        let skipped = 0;
        const errors = [];

        for (const row of normalizedRows) {
            try {
                const name = row.name || row.licensee_name || row['નામ'] || '';
                if (!name || name.toString().trim() === '') {
                    skipped++;
                    continue;
                }

                // Check if licensee already exists by name
                const existing = db.queryOne(
                    'SELECT id FROM licensees WHERE name = @name',
                    { name: name.toString().trim() }
                );

                let licenseeId;
                if (existing) {
                    licenseeId = existing.id;
                    // Update existing licensee
                    this._updateLicensee(licenseeId, row);
                } else {
                    // Insert new licensee
                    licenseeId = this._insertLicensee(row);
                }

                // Handle license type mapping
                const licenseTypeCode = row.license_type_code || row.license_type || row['પરવાનાનો_પ્રકાર'] || '';
                const licenseNumber = row.license_number || row.license_no || row['પરવાના_નંબર'] || '';
                
                if (licenseTypeCode) {
                    const code = licenseTypeCode.toString().trim().toUpperCase();
                    
                    // Find or create the license type
                    let licenseType = db.queryOne(
                        'SELECT id FROM license_types WHERE code = @code',
                        { code }
                    );
                    
                    let licenseTypeId;
                    if (licenseType) {
                        licenseTypeId = licenseType.id;
                    } else {
                        // Auto-create license type if it doesn't exist
                        licenseTypeId = db.insert(`
                            INSERT INTO license_types (code, total_count, inspection_standard)
                            VALUES (@code, 0, @standard)
                        `, {
                            code,
                            standard: this._getDefaultStandard(code)
                        });
                    }

                    // Map licensee to license type (avoid duplicate mapping)
                    const existingMapping = db.queryOne(
                        'SELECT id FROM licensee_licenses WHERE licensee_id = @lid AND license_type_id = @ltid',
                        { lid: licenseeId, ltid: licenseTypeId }
                    );

                    if (!existingMapping) {
                        db.insert(`
                            INSERT INTO licensee_licenses (licensee_id, license_type_id, license_number, status)
                            VALUES (@lid, @ltid, @ln, 'active')
                        `, {
                            lid: licenseeId,
                            ltid: licenseTypeId,
                            ln: licenseNumber || ''
                        });
                    }
                }

                imported++;
            } catch (e) {
                errors.push(`Row error: ${e.message}`);
                skipped++;
            }
        }

        // Record import history
        const filename = path.basename(filePath);
        db.insert(`
            INSERT INTO bulk_imports (filename, count_imported, status)
            VALUES (@filename, @count, 'completed')
        `, { filename, count: imported });

        return { imported, skipped, errors };
    }

    _insertLicensee(row) {
        return db.insert(`
            INSERT INTO licensees (name, address, gidc_area, phone, email, 
                contact_person, nokarnama_holder, is_priority, notes)
            VALUES (@name, @address, @gidc_area, @phone, @email,
                @contact_person, @nokarnama_holder, @is_priority, @notes)
        `, {
            name: this._getString(row, ['name', 'licensee_name', 'નામ']),
            address: this._getString(row, ['address', 'ਸરનામું']),
            gidc_area: this._getString(row, ['gidc_area', 'area', 'gidc', 'વિસ્તાર']),
            phone: this._getString(row, ['phone', 'mobile', 'contact', 'ફોન']),
            email: this._getString(row, ['email', 'ઈમેલ']),
            contact_person: this._getString(row, ['contact_person', 'contact', 'સંપર્ક_વ્યક્તિ']),
            nokarnama_holder: this._getString(row, ['nokarnama_holder', 'nokarnama', 'નોકરનામા_ધારક'], 'No'),
            is_priority: this._getBool(row, ['is_priority', 'priority', 'પ્રાથમિકતા']),
            notes: this._getString(row, ['notes', 'remark', 'નોંધ'])
        });
    }

    _updateLicensee(id, row) {
        db.run(`
            UPDATE licensees SET 
                name = @name, address = @address, gidc_area = @gidc_area,
                phone = @phone, email = @email, contact_person = @contact_person,
                nokarnama_holder = @nokarnama_holder, is_priority = @is_priority,
                notes = @notes, updated_at = datetime('now','localtime')
            WHERE id = @id
        `, {
            id,
            name: this._getString(row, ['name', 'licensee_name', 'નામ']),
            address: this._getString(row, ['address', 'સરનામું']),
            gidc_area: this._getString(row, ['gidc_area', 'area', 'gidc', 'વિસ્તાર']),
            phone: this._getString(row, ['phone', 'mobile', 'contact', 'ફોન']),
            email: this._getString(row, ['email', 'ઈમેલ']),
            contact_person: this._getString(row, ['contact_person', 'contact', 'સંપર્ક_વ્યક્તિ']),
            nokarnama_holder: this._getString(row, ['nokarnama_holder', 'nokarnama', 'નોકરનામા_ધારક'], 'No'),
            is_priority: this._getBool(row, ['is_priority', 'priority', 'પ્રાથમિકતા']),
            notes: this._getString(row, ['notes', 'remark', 'નોંધ'])
        });
    }

    _getString(row, keys, defaultVal = '') {
        for (const key of keys) {
            if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                return String(row[key]).trim();
            }
        }
        return defaultVal;
    }

    _getBool(row, keys) {
        for (const key of keys) {
            if (row[key] !== undefined && row[key] !== null) {
                const v = String(row[key]).trim().toLowerCase();
                if (v === 'true' || v === '1' || v === 'yes' || v === 'હા' || v === '⭐') return 1;
                return 0;
            }
        }
        return 0;
    }

    _getDefaultStandard(code) {
        const standards = {
            'FL1': 'દર માસે', 'FL2': 'દર માસે', 'M1': 'દર માસે',
            'DISTL': 'દર માસે', 'DS1': 'દર માસે',
            'DS5': 'દર માસે', 'DS6': 'દર માસે', 'DS7': 'દર બે માસે',
            'DSP1': 'દર માસે', 'DSP4': 'દર બે માસે',
            'RS1': 'દર ચાર માસે', 'RS6': 'દર માસે',
            'DD1': 'દર માસે', 'MF1': 'દર છ માસે',
            'N3': 'દર ત્રણ માસે', 'N4': 'દર ત્રણ માસે',
            'SMP1': 'દર ત્રણ માસે', 'AC1': 'દર બે માસે',
            'MA2': 'દર બે માસે', 'RG1': 'દર બે માસે',
            'SA1': 'દર બે માસે',
            'DD2': 'દર છ માસે', 'M2': 'દર છ માસે',
            'MF2': 'દર છ માસે', 'AC2': 'દર છ માસે',
            'MA1': 'દર ત્રણ માસે',
            'DSP3': 'વર્ષે એક વખત', 'SMP2': 'વર્ષે એક વખત'
        };
        return standards[code] || '';
    }

    // Get import history
    getImportHistory() {
        return db.queryAll(
            'SELECT * FROM bulk_imports ORDER BY import_date DESC LIMIT 50'
        );
    }

    // Parse file and return preview data (without importing)
    previewFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.xlsx' && ext !== '.xls' && ext !== '.csv') {
            throw new Error('ફક્ત Excel (.xlsx/.xls) અથવા CSV (.csv) ફાઇલો સપોર્ટેડ છે.');
        }

        let wb;
        if (ext === '.csv') {
            const csvData = fs.readFileSync(filePath, 'utf8');
            wb = XLSX.read(csvData, { type: 'string', raw: true });
        } else {
            wb = XLSX.readFile(filePath, { raw: true });
        }

        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
        
        if (!rows || rows.length === 0) {
            return { headers: [], rows: [], totalRows: 0 };
        }

        const headers = rows[0].map(h => String(h).trim());
        const dataRows = rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
        
        // Show only first 20 rows for preview
        const previewRows = dataRows.slice(0, 20).map(r => r.map(c => String(c).trim()));
        
        return {
            headers,
            rows: previewRows,
            totalRows: dataRows.length,
            totalPreview: previewRows.length
        };
    }
}

module.exports = new BulkImport();
