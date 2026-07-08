const db = require('../database/init');
const XLSX = require('xlsx');
const path = require('path');

class LicenseTypeManager {
    // Import license types from List_of_Licenses.xlsx
    importFromExcel(filePath) {
        const wb = XLSX.readFile(filePath);
        const ws = wb.Sheets['Sheet1'];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        
        let count = 0;
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const srNo = row[0];
            const code = row[1] ? row[1].toString().trim().toUpperCase() : '';
            const totalCount = parseInt(row[2]) || 0;
            
            if (!code || srNo === '' || srNo === null) continue;
            if (code === 'TOTAL') break;
            
            try {
                db.insert(`
                    INSERT OR REPLACE INTO license_types (code, total_count, inspection_standard)
                    VALUES (@code, @total_count, @inspection_standard)
                `, {
                    code,
                    total_count: totalCount,
                    inspection_standard: this.getDefaultStandard(code)
                });
                count++;
            } catch (e) {
                // Skip duplicates silently
            }
        }
        return count;
    }

    // Map license code to diary abstract categories
    getCategory(code) {
        const important = ['FL1', 'FL2', 'M1', 'DISTL', 'DS1'];
        const main = ['DS5', 'DS6', 'DS7', 'DSP1', 'DSP4', 'RS1', 'RS2', 'RS6', 'DD1', 'MF1', 'N3', 'N4', 'SMP1', 'AC1', 'MA2', 'RG1', 'SA1', 'SA2', 'FORM B'];
        const minor = ['DD2', 'DD3', 'M2', 'M3', 'MF2', 'AC2', 'MA1'];
        const general = ['DSP3', 'DS2', 'DS3', 'DS4', 'SMP2', 'OP2A', 'B2A', 'SW1'];
        
        if (important.includes(code)) return 'અગત્યના પરવાના';
        if (main.includes(code)) return 'મુખ્ય પરવાના';
        if (minor.includes(code)) return 'માઇનોર પરવાના';
        if (general.includes(code)) return 'સામાન્ય પરવાના';
        return 'અન્ય પરવાના';
    }

    // Get default inspection standard
    getDefaultStandard(code) {
        const standards = {
            'FL1': 'દર માસે', 'FL2': 'દર માસે', 'M1': 'દર માસે',
            'DISTL': 'દર માસે', 'DS1': 'દર માસે',
            'DS5': 'દર માસે', 'DS6': 'દર માસે', 'DS7': 'દર બે માસે',
            'DSP1': 'દર માસે', 'DSP4': 'દર બે માસે',
            'RS1': 'દર ચાર માસે', 'RS2': 'દર ચાર માસે', 'RS6': 'દર માસે',
            'DD1': 'દર માસે', 'MF1': 'દર છ માસે', 'N3': 'દર ત્રણ માસે',
            'N4': 'દર ત્રણ માસે', 'SMP1': 'દર ત્રણ માસે',
            'AC1': 'દર બે માસે', 'MA2': 'દર બે માસે',
            'RG1': 'દર બે માસે', 'SA1': 'દર બે માસે', 'SA2': 'દર બે માસે',
            'DD2': 'દર છ માસે', 'M2': 'દર છ માસે',
            'MF2': 'દર છ માસે', 'AC2': 'દર છ માસે', 'MA1': 'દર ત્રણ માસે',
            'DSP3': 'વર્ષે એક વખત', 'DS2': 'વર્ષે એક વખત',
            'DS3': 'વર્ષે એક વખત', 'DS4': 'વર્ષે એક વખત',
            'SMP2': 'વર્ષે એક વખત'
        };
        return standards[code] || '';
    }

    // Get all license types
    getAll() {
        return db.queryAll('SELECT * FROM license_types ORDER BY code');
    }

    // Get license types grouped by category
    getByCategory() {
        const all = this.getAll();
        const grouped = {};
        for (const lt of all) {
            const cat = this.getCategory(lt.code);
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(lt);
        }
        return grouped;
    }

    // Get license type by code
    getByCode(code) {
        return db.queryOne('SELECT * FROM license_types WHERE code = ?', [code]);
    }

    // Get template ID for a license type
    getTemplateForLicense(code) {
        // Determine which template to use
        if (code.startsWith('FL')) return 'FL';
        if (code === 'MA2') return 'MA2';
        if (['RS2', 'RS', 'RS1', 'RS6'].includes(code)) return 'RS';
        return 'DEFAULT'; // Full MA1-style template
    }

    // Update total count
    updateTotal(code, total) {
        return db.run('UPDATE license_types SET total_count = ? WHERE code = ?', [total, code]);
    }
}

module.exports = new LicenseTypeManager();
