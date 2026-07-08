const db = require('../database/init');

class LicenseeManager {
    // Add new licensee
    addLicensee(data) {
        return db.insert(`
            INSERT INTO licensees (name, address, gidc_area, phone, email, 
                contact_person, nokarnama_holder, latitude, longitude, is_priority, notes)
            VALUES (@name, @address, @gidc_area, @phone, @email,
                @contact_person, @nokarnama_holder, @latitude, @longitude, @is_priority, @notes)
        `, {
            name: data.name || '',
            address: data.address || '',
            gidc_area: data.gidc_area || '',
            phone: data.phone || '',
            email: data.email || '',
            contact_person: data.contact_person || '',
            nokarnama_holder: data.nokarnama_holder || '',
            latitude: data.latitude || null,
            longitude: data.longitude || null,
            is_priority: data.is_priority ? 1 : 0,
            notes: data.notes || ''
        });
    }

    // Update licensee
    updateLicensee(id, data) {
        data.updated_at = new Date().toISOString();
        return db.run(`
            UPDATE licensees SET 
                name = @name, address = @address, gidc_area = @gidc_area,
                phone = @phone, email = @email, contact_person = @contact_person,
                nokarnama_holder = @nokarnama_holder, latitude = @latitude,
                longitude = @longitude, is_priority = @is_priority,
                notes = @notes, updated_at = @updated_at
            WHERE id = @id
        `, { ...data, id, is_priority: data.is_priority ? 1 : 0 });
    }

    // Get all licensees
    getAllLicensees() {
        return db.queryAll('SELECT * FROM licensees ORDER BY name');
    }

    // Get priority (must-inspect) licensees
    getPriorityLicensees() {
        return db.queryAll('SELECT * FROM licensees WHERE is_priority = 1 ORDER BY gidc_area, name');
    }

    // Get licensee by ID
    getLicensee(id) {
        return db.queryOne('SELECT * FROM licensees WHERE id = ?', [id]);
    }

    // Search licensees
    searchLicensees(query) {
        const q = `%${query}%`;
        return db.queryAll(
            `SELECT * FROM licensees 
             WHERE name LIKE ? OR address LIKE ? OR gidc_area LIKE ? 
             ORDER BY name`,
            [q, q, q]
        );
    }

    // Delete licensee
    deleteLicensee(id) {
        return db.run('DELETE FROM licensees WHERE id = ?', [id]);
    }

    // Add license to licensee
    addLicenseeLicense(data) {
        return db.insert(`
            INSERT INTO licensee_licenses (licensee_id, license_type_id, license_number, 
                uln, validity_date, possession_limit, consumption_limit, purpose)
            VALUES (@licensee_id, @license_type_id, @license_number,
                @uln, @validity_date, @possession_limit, @consumption_limit, @purpose)
        `, data);
    }

    // Get all licenses of a licensee
    getLicenseeLicenses(licenseeId) {
        return db.queryAll(`
            SELECT ll.*, lt.code as license_code, lt.name_guj, lt.category, lt.inspection_standard
            FROM licensee_licenses ll
            JOIN license_types lt ON ll.license_type_id = lt.id
            WHERE ll.licensee_id = ? AND ll.status = 'active'
            ORDER BY lt.category, lt.code
        `, [licenseeId]);
    }

    // Get licensee's last inspection for "Use Last Visit" feature
    getLastInspection(licenseeId, licenseTypeCode) {
        return db.queryOne(`
            SELECT i.* FROM inspections i
            WHERE i.licensee_id = ? AND i.license_type_code = ?
            ORDER BY i.date_of_inspection DESC, i.id DESC
            LIMIT 1
        `, [licenseeId, licenseTypeCode]);
    }

    // Get last inspection fields
    getLastInspectionFields(inspectionId) {
        return db.queryAll(`
            SELECT field_label, field_value, section_name 
            FROM inspection_fields 
            WHERE inspection_id = ?
            ORDER BY field_order
        `, [inspectionId]);
    }
}

module.exports = new LicenseeManager();
