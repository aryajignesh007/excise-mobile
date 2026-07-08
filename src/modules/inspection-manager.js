const db = require('../database/init');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

class InspectionManager {
    // Generate report number
    generateReportNumber(licenseType, licenseeId, year, month) {
        const licensee = db.queryOne('SELECT name FROM licensees WHERE id = ?', [licenseeId]);
        const shortName = licensee ? licensee.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) : 'XX';
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const mName = monthNames[(parseInt(month) || new Date().getMonth())];
        
        // Count existing reports for this year
        const count = db.queryOne(
            `SELECT COUNT(*) as cnt FROM inspections WHERE report_number LIKE ?`,
            [`%${year}%`]
        );
        const seq = (count.cnt + 1).toString().padStart(2, '0');
        
        return `IR/SPE/${year}/${shortName}/${mName}/${seq}`;
    }

    // Create new inspection
    createInspection(data) {
        const reportNo = data.report_number || this.generateReportNumber(
            data.license_type_code, data.licensee_id, 
            new Date().getFullYear(), new Date().getMonth() + 1
        );
        
        const id = db.insert(`
            INSERT INTO inspections (report_number, date_of_inspection, time_of_inspection,
                licensee_id, from_location, to_location, vehicle_details, distance_km,
                license_type_code, consolidated_report, violations_found, violations_notes,
                applicable_rules, officer_remarks, subordinate_staff)
            VALUES (@report_number, @date_of_inspection, @time_of_inspection,
                @licensee_id, @from_location, @to_location, @vehicle_details, @distance_km,
                @license_type_code, @consolidated_report, @violations_found, @violations_notes,
                @applicable_rules, @officer_remarks, @subordinate_staff)
        `, {
            report_number: reportNo,
            date_of_inspection: data.date_of_inspection || new Date().toISOString().split('T')[0],
            time_of_inspection: data.time_of_inspection || '',
            licensee_id: data.licensee_id || null,
            from_location: data.from_location || 'Nanpura, Surat',
            to_location: data.to_location || '',
            vehicle_details: data.vehicle_details || '',
            distance_km: data.distance_km || 0,
            license_type_code: data.license_type_code || '',
            consolidated_report: data.consolidated_report ? 1 : 0,
            violations_found: data.violations_found || 'No',
            violations_notes: data.violations_notes || '',
            applicable_rules: data.applicable_rules || '',
            officer_remarks: data.officer_remarks || '',
            subordinate_staff: data.subordinate_staff || ''
        });

        // Save dynamic fields
        if (data.fields && Array.isArray(data.fields)) {
            for (const f of data.fields) {
                db.insert(`
                    INSERT INTO inspection_fields (inspection_id, field_label, field_value, section_name, field_order)
                    VALUES (@inspection_id, @field_label, @field_value, @section_name, @field_order)
                `, {
                    inspection_id: id,
                    field_label: f.label,
                    field_value: f.value,
                    section_name: f.section,
                    field_order: f.order || 0
                });
            }
        }

        return id;
    }

    // Save inspection fields
    saveFields(inspectionId, fields) {
        // Delete existing fields first
        db.run('DELETE FROM inspection_fields WHERE inspection_id = @id', { id: inspectionId });
        
        for (const f of fields) {
            db.insert(`
                INSERT INTO inspection_fields (inspection_id, field_label, field_value, section_name, field_order)
                VALUES (@inspection_id, @field_label, @field_value, @section_name, @field_order)
            `, {
                inspection_id: inspectionId,
                field_label: f.label,
                field_value: f.value,
                section_name: f.section,
                field_order: f.order || 0
            });
        }
    }

    // Get inspection with all fields
    getInspection(id) {
        const insp = db.queryOne('SELECT * FROM inspections WHERE id = ?', [id]);
        if (!insp) return null;
        
        insp.fields = db.queryAll(
            'SELECT * FROM inspection_fields WHERE inspection_id = ? ORDER BY field_order',
            [id]
        );
        insp.photos = db.queryAll(
            'SELECT * FROM inspection_photos WHERE inspection_id = ?',
            [id]
        );
        return insp;
    }

    // Get inspections by licensee
    getByLicensee(licenseeId) {
        return db.queryAll(
            'SELECT * FROM inspections WHERE licensee_id = ? ORDER BY date_of_inspection DESC',
            [licenseeId]
        );
    }

    // Get inspections by month/year
    getByMonth(month, year) {
        const m = month.toString().padStart(2, '0');
        return db.queryAll(
            `SELECT i.*, l.name as licensee_name, l.address as licensee_address 
             FROM inspections i 
             LEFT JOIN licensees l ON i.licensee_id = l.id
             WHERE substr(i.date_of_inspection, 6, 2) = @m 
             AND substr(i.date_of_inspection, 1, 4) = @y
             ORDER BY i.date_of_inspection, i.time_of_inspection`,
            { m, y: year.toString() }
        );
    }

    // Get all inspections for a month grouped by license type
    getInspectionCountsByType(month, year) {
        const m = month.toString().padStart(2, '0');
        return db.queryAll(`
            SELECT i.license_type_code, COUNT(*) as count
            FROM inspections i
            WHERE substr(i.date_of_inspection, 6, 2) = @m
            AND substr(i.date_of_inspection, 1, 4) = @y
            GROUP BY i.license_type_code
            ORDER BY i.license_type_code
        `, { m, y: year.toString() });
    }

    // ======================================================================
    // V4a: Export single inspection to Excel (.xlsx)
    // ======================================================================
    exportToSpreadsheet(inspectionId, outputPath) {
        const insp = this.getInspection(inspectionId);
        if (!insp) throw new Error('Inspection not found');

        const licensee = insp.licensee_id 
            ? db.queryOne('SELECT * FROM licensees WHERE id = @id', { id: insp.licensee_id })
            : null;

        // Get settings
        const getSetting = (key, def) => {
            const r = db.queryOne('SELECT value FROM app_settings WHERE key = @key', { key });
            return r ? r.value : def;
        };
        const officerName = getSetting('officer_name', 'Jignesh S Tanna');
        const officerDesig = getSetting('officer_designation', 'Superintendent');

        const XLSX = require('xlsx');
        const wb = XLSX.utils.book_new();

        // Build header metadata
        const metaRows = [
            ['Inspector Name', officerName],
            ['Designation', officerDesig],
            ['Department', 'Prohibition and Excise Department, Surat'],
            [''],
            ['Report Number', insp.report_number],
            ['Date of Inspection', insp.date_of_inspection],
            ['Time', insp.time_of_inspection || '-'],
            ['License Type', insp.license_type_code || '-'],
            ['Licensee Name', (licensee && licensee.name) || '-'],
            ['Address', (licensee && licensee.address) || '-'],
            ['Area/GIDC', (licensee && licensee.gidc_area) || '-'],
            ['Contact Person', (licensee && licensee.contact_person) || '-'],
            ['Location Visited', insp.to_location || '-'],
            ['Vehicle Details', insp.vehicle_details || '-'],
            ['Distance (km)', insp.distance_km || 0],
            [''],
            ['Violations Found', insp.violations_found || 'No'],
            ['Violation Notes', insp.violations_notes || '-'],
            ['Officer Remarks', insp.officer_remarks || '-'],
            ['Subordinate Staff', insp.subordinate_staff || '-'],
        ];

        if (insp.fields && insp.fields.length > 0) {
            metaRows.push(['']);
            metaRows.push(['--- Detailed Fields ---', '']);
            for (const f of insp.fields) {
                metaRows.push([f.field_label, f.field_value || '-']);
            }
        }

        const ws = XLSX.utils.aoa_to_sheet(metaRows);
        ws['!cols'] = [{ wch: 30 }, { wch: 50 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Inspection Report');

        // Ensure export directory
        const exportDir = path.join(__dirname, '..', '..', 'data', 'exported');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }

        const outputFile = outputPath || path.join(exportDir, 
            `Inspection-${insp.id}-${insp.report_number.replace(/[/\s]/g, '_')}.xlsx`);
        XLSX.writeFile(wb, outputFile);
        return outputFile;
    }

    // ======================================================================
    // V4a: Generate HTML report for a single inspection (for PDF printing)
    // ======================================================================
    generateHtmlReport(inspectionId) {
        const insp = this.getInspection(inspectionId);
        if (!insp) throw new Error('Inspection not found');

        const licensee = insp.licensee_id
            ? db.queryOne('SELECT * FROM licensees WHERE id = @id', { id: insp.licensee_id })
            : null;

        const getSetting = (key, def) => {
            const r = db.queryOne('SELECT value FROM app_settings WHERE key = @key', { key });
            return r ? r.value : def;
        };
        const officerName = getSetting('officer_name', 'Jignesh S Tanna');
        const officerDesig = getSetting('officer_designation', 'Superintendent');

        let fieldsHtml = '';
        if (insp.fields && insp.fields.length > 0) {
            fieldsHtml = '<h3 style="margin-top:15px;color:#1a237e">વિગતવાર માહિતી / Detailed Information</h3><table class="data-table">';
            for (const f of insp.fields) {
                fieldsHtml += `<tr><td style="font-weight:600;width:40%">${this._escapeHtml(f.field_label)}</td><td>${this._escapeHtml(f.field_value || '-')}</td></tr>`;
            }
            fieldsHtml += '</table>';
        }

        const violationsClass = insp.violations_found === 'Yes' ? 'violation-yes' : 'violation-no';
        const licenseeName = licensee ? this._escapeHtml(licensee.name) : '-';
        const licenseeAddr = licensee ? this._escapeHtml(licensee.address || '-') : '-';
        const licenseeArea = licensee ? this._escapeHtml(licensee.gidc_area || '-') : '-';
        const licenseeContact = licensee ? this._escapeHtml(licensee.contact_person || '-') : '-';

        return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Inspection Report - ${this._escapeHtml(insp.report_number)}</title>
<style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #333; }
    .header { text-align: center; border-bottom: 3px solid #1a237e; padding-bottom: 15px; margin-bottom: 25px; }
    .header h1 { color: #1a237e; font-size: 22px; margin: 0 0 5px 0; }
    .header .sub { color: #666; font-size: 14px; }
    .section-title { background: #e8eaf6; padding: 8px 12px; font-weight: 700; color: #1a237e; margin: 20px 0 10px 0; border-radius: 4px; font-size: 15px; }
    table.data-table { width: 100%; border-collapse: collapse; margin: 5px 0; }
    table.data-table td { padding: 8px 12px; border: 1px solid #ddd; font-size: 13px; vertical-align: top; }
    table.data-table tr:nth-child(even) { background: #f8f9ff; }
    .violation-yes { color: #c62828; font-weight: 700; }
    .violation-no { color: #2e7d32; font-weight: 700; }
    .signature { margin-top: 50px; text-align: right; }
    .footer { text-align: center; font-size: 11px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; }
    @media print { body { margin: 20px; } }
</style></head><body>
<div class="header">
    <h1>નિરીક્ષણ અહેવાલ / Inspection Report</h1>
    <div class="sub">Prohibition and Excise Department, Surat</div>
</div>
<div class="section-title">રિપોર્ટ માહિતી / Report Information</div>
<table class="data-table">
    <tr><td style="font-weight:600;width:35%">Report Number</td><td>${this._escapeHtml(insp.report_number)}</td></tr>
    <tr><td style="font-weight:600">Date of Inspection</td><td>${this._escapeHtml(insp.date_of_inspection)}</td></tr>
    <tr><td style="font-weight:600">Time</td><td>${this._escapeHtml(insp.time_of_inspection || '-')}</td></tr>
    <tr><td style="font-weight:600">License Type</td><td>${this._escapeHtml(insp.license_type_code || '-')}</td></tr>
</table>
<div class="section-title">લાયસન્સી માહિતી / Licensee Information</div>
<table class="data-table">
    <tr><td style="font-weight:600;width:35%">Name</td><td>${licenseeName}</td></tr>
    <tr><td style="font-weight:600">Address</td><td>${licenseeAddr}</td></tr>
    <tr><td style="font-weight:600">Area/GIDC</td><td>${licenseeArea}</td></tr>
    <tr><td style="font-weight:600">Contact Person</td><td>${licenseeContact}</td></tr>
</table>
<div class="section-title">નિરીક્ષણ વિગત / Inspection Details</div>
<table class="data-table">
    <tr><td style="font-weight:600;width:35%">Location Visited</td><td>${this._escapeHtml(insp.to_location || '-')}</td></tr>
    <tr><td style="font-weight:600">Vehicle</td><td>${this._escapeHtml(insp.vehicle_details || '-')}</td></tr>
    <tr><td style="font-weight:600">Distance (km)</td><td>${insp.distance_km || 0}</td></tr>
    <tr><td style="font-weight:600">Violations Found</td><td class="${violationsClass}">${this._escapeHtml(insp.violations_found || 'No')}</td></tr>
    <tr><td style="font-weight:600">Violation Notes</td><td>${this._escapeHtml(insp.violations_notes || '-')}</td></tr>
    <tr><td style="font-weight:600">Officer Remarks</td><td>${this._escapeHtml(insp.officer_remarks || '-')}</td></tr>
    <tr><td style="font-weight:600">Subordinate Staff</td><td>${this._escapeHtml(insp.subordinate_staff || '-')}</td></tr>
</table>
${fieldsHtml}
<div class="signature">
    <p>(${this._escapeHtml(officerName)})</p>
    <p>${this._escapeHtml(officerDesig)}</p>
    <p>Prohibition and Excise, Surat</p>
</div>
<div class="footer">Generated on ${new Date().toLocaleString('gu-IN')} | Excise Inspection Manager v4a</div>
</body></html>`;
    }

    _escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Add photo to inspection
    addPhoto(inspectionId, filePath, lat, lng, timestamp, caption) {
        return db.insert(`
            INSERT INTO inspection_photos (inspection_id, file_path, latitude, longitude, timestamp, caption)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [inspectionId, filePath, lat, lng, timestamp, caption]);
    }

    // Export inspection to Excel
    exportToExcel(inspectionId, outputPath) {
        const insp = this.getInspection(inspectionId);
        if (!insp) throw new Error('Inspection not found');

        // Load the appropriate template
        const templatePath = this.getTemplatePath(insp.license_type_code);
        
        let wb;
        if (templatePath && fs.existsSync(templatePath)) {
            wb = XLSX.readFile(templatePath);
        } else {
            wb = XLSX.utils.book_new();
        }

        const ws = wb.Sheets['Sheet1'] || XLSX.utils.aoa_to_sheet([]);
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // Fill in the data
        const licensee = insp.licensee_id ? db.queryOne('SELECT * FROM licensees WHERE id = ?', [insp.licensee_id]) : null;

        data.forEach((row, idx) => {
            const label = (row[0] || '').toString().trim();
            
            // Map labels to values
            const valueMap = {
                'Inspection Report Number:': insp.report_number,
                'Date of Inspection:': insp.date_of_inspection,
                'Time of Inspection:': insp.time_of_inspection,
                'Name:': 'Jignesh S Tanna',
                'Designation:': 'Superintendent',
                'Department:': 'Prohibition and Excise Department, Surat',
                'Contact:': 9426583984,
                'Name of Licensee': licensee ? licensee.name : '',
                'Address:': licensee ? licensee.address : '',
                'District:': 'Surat District',
                'Whether Nokarnama Holder is present': licensee ? licensee.nokarnama_holder : '',
                'Name of Authorised Person/Nokarnama Holder': licensee ? licensee.contact_person : '',
                'Violations found or not?': insp.violations_found,
                'Other Remarks, if any': insp.officer_remarks
            };

            if (valueMap[label] !== undefined) {
                row[1] = valueMap[label];
            }

            // Fill from saved fields
            if (insp.fields) {
                for (const f of insp.fields) {
                    if (label === f.field_label || label.includes(f.field_label)) {
                        row[1] = f.field_value;
                    }
                }
            }
        });

        // Update the sheet
        XLSX.utils.sheet_add_aoa(ws, data);
        wb.Sheets['Sheet1'] = ws;

        const outputFile = outputPath || path.join(__dirname, '..', '..', 'data', `inspection_${insp.id}.xlsx`);
        XLSX.writeFile(wb, outputFile);
        return outputFile;
    }

    // Get the appropriate template path for a license type
    getTemplatePath(licenseTypeCode) {
        const templatesDir = path.join(__dirname, '..', 'templates');
        if (!fs.existsSync(templatesDir)) return null;

        if (licenseTypeCode && licenseTypeCode.startsWith('FL')) {
            // Try FL template
            const flFiles = fs.readdirSync(templatesDir).filter(f => f.includes('FL'));
            if (flFiles.length > 0) return path.join(templatesDir, flFiles[0]);
        }
        
        if (licenseTypeCode === 'MA2') {
            const ma2Files = fs.readdirSync(templatesDir).filter(f => f.includes('MA-2'));
            if (ma2Files.length > 0) return path.join(templatesDir, ma2Files[0]);
        }

        // Default to the latest/general template
        const xltxFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.xltx') && f.includes('Inpsection_Template-New'));
        if (xltxFiles.length > 0) return path.join(templatesDir, xltxFiles[0]);
        
        // Fallback
        const allXltx = fs.readdirSync(templatesDir).filter(f => f.endsWith('.xltx'));
        return allXltx.length > 0 ? path.join(templatesDir, allXltx[0]) : null;
    }

}

module.exports = new InspectionManager();
