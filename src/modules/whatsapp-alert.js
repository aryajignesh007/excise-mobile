const db = require('../database/init');
const { execSync } = require('child_process');
const path = require('path');

class WhatsAppAlert {
    constructor() {
        this.wacliPath = 'wacli'; // resolved from PATH or config
    }

    /**
     * Send a WhatsApp reminder about upcoming inspections
     * @param {object} options - { date, inspectionIds, customMessage }
     * @returns {object} - { success, message }
     */
    sendReminder(options = {}) {
        const enabled = this._getSetting('whatsapp_enabled', 'false');
        if (enabled !== 'true') {
            return { success: false, error: 'WhatsApp અલર્ટ સક્ષમ નથી. કૃપા કરીને સેટિંગ્સમાં સક્ષમ કરો.' };
        }

        const account = this._getSetting('whatsapp_account', 'personal');
        const officerContact = this._getSetting('officer_contact', '9426583984');
        const date = options.date;
        let inspections = [];

        if (options.inspectionIds && options.inspectionIds.length > 0) {
            // Load specific inspections
            for (const id of options.inspectionIds) {
                const insp = db.queryOne(`
                    SELECT i.*, l.name as licensee_name, l.gidc_area
                    FROM inspections i
                    LEFT JOIN licensees l ON i.licensee_id = l.id
                    WHERE i.id = @id
                `, { id });
                if (insp) inspections.push(insp);
            }
        } else if (date) {
            // Load inspections for the given date
            inspections = db.queryAll(`
                SELECT i.*, l.name as licensee_name, l.gidc_area
                FROM inspections i
                LEFT JOIN licensees l ON i.licensee_id = l.id
                WHERE i.date_of_inspection = @date
                ORDER BY i.time_of_inspection
            `, { date });
        }

        if (inspections.length === 0) {
            return { success: false, error: 'આ તારીખે કોઈ નિરીક્ષણ નથી.' };
        }

        // Build message
        const officerName = this._getSetting('officer_name', 'Jignesh S Tanna');
        const lines = [];
        lines.push(`🔍 *નિરીક્ષણ રીમાઇન્ડર*`);
        lines.push(`*${officerName}*`);
        lines.push('');
        lines.push(`તારીખ: ${date || options.customDate || 'N/A'}`);
        lines.push(`કુલ નિરીક્ષણ: ${inspections.length}`);
        lines.push('');

        for (let i = 0; i < inspections.length; i++) {
            const insp = inspections[i];
            lines.push(`${i + 1}. ${insp.licensee_name || 'N/A'}`);
            if (insp.time_of_inspection) {
                lines.push(`   ⏰ ${insp.time_of_inspection}`);
            }
            if (insp.gidc_area) {
                lines.push(`   📍 ${insp.gidc_area}`);
            }
            if (insp.license_type_code) {
                lines.push(`   🏷️ ${insp.license_type_code}`);
            }
            if (insp.to_location) {
                lines.push(`   🚗 ${insp.to_location}`);
            }
        }

        if (options.customMessage) {
            lines.push('');
            lines.push(options.customMessage);
        }

        lines.push('');
        lines.push('📍 *Excise Inspection Manager - Surat*');

        const message = lines.join('\n');

        // Send to self (officer's number)
        try {
            const cmd = `"${this.wacliPath}" --account ${account} send text --to "+91${officerContact}" --message "${message.replace(/"/g, '\\"')}"`;
            
            // Attempt to send - handle gracefully if wacli isn't available
            try {
                const result = execSync(cmd, { timeout: 15000, encoding: 'utf8' });
                this._markSent(inspections);
                return { success: true, message: '✅ WhatsApp રીમાઇન્ડર મોકલાયો!' };
            } catch (e) {
                // If wacli not found, return the message text so UI can show it
                return { 
                    success: true, 
                    message: '📱 WhatsApp મેસેજ તૈયાર છે (wacli ઉપલબ્ધ નથી). મેસેજ નીચે જુઓ:',
                    text: message,
                    simulated: true
                };
            }
        } catch (e) {
            return { success: false, error: `WhatsApp ભૂલ: ${e.message}` };
        }
    }

    /**
     * Mark inspections as having WhatsApp notification sent
     */
    _markSent(inspections) {
        for (const insp of inspections) {
            // Record in reminders table
            const existingReminder = db.queryOne(
                'SELECT id FROM reminders WHERE reminder_date = @date AND licensee_id = @lid',
                { date: insp.date_of_inspection, lid: insp.licensee_id }
            );
            if (!existingReminder) {
                db.insert(`
                    INSERT INTO reminders (reminder_date, title, description, licensee_id, is_completed, whatsapp_sent)
                    VALUES (@date, @title, @desc, @lid, 0, 1)
                `, {
                    date: insp.date_of_inspection,
                    title: `નિરીક્ષણ રીમાઇન્ડર`,
                    desc: `${insp.licensee_name} - ${insp.license_type_code}`,
                    lid: insp.licensee_id
                });
            } else {
                db.run('UPDATE reminders SET whatsapp_sent = 1 WHERE id = @id', { id: existingReminder.id });
            }
        }
    }

    _getSetting(key, defaultVal) {
        const row = db.queryOne('SELECT value FROM app_settings WHERE key = @key', { key });
        return row ? row.value : defaultVal;
    }

    // Test wacli availability
    testConnection() {
        try {
            execSync(`"${this.wacliPath}" --help`, { timeout: 5000, encoding: 'utf8' });
            return { success: true, message: 'wacli ઉપલબ્ધ છે.' };
        } catch (e) {
            return { success: false, message: 'wacli મળ્યું નથી. કૃપા કરીને wacli ઇન્સ્ટોલ કરો.' };
        }
    }

    // Save WhatsApp settings
    saveSettings(settings) {
        for (const [key, value] of Object.entries(settings)) {
            const settingKey = key.startsWith('whatsapp_') ? key : `whatsapp_${key}`;
            db.run(`
                INSERT OR REPLACE INTO app_settings (key, value) 
                VALUES (@key, @value)
            `, { key: settingKey, value: String(value) });
        }
        return { success: true };
    }

    // Get WhatsApp settings
    getSettings() {
        const rows = db.queryAll(
            "SELECT key, value FROM app_settings WHERE key LIKE 'whatsapp_%'"
        );
        const settings = {};
        for (const row of rows) {
            settings[row.key.replace('whatsapp_', '')] = row.value;
        }
        return settings;
    }
}

module.exports = new WhatsAppAlert();
