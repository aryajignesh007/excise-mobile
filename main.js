const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const db = require('./src/database/init');

let mainWindow;

async function createWindow() {
    // Initialize database (async for sql.js)
    await db.initAsync();
    
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 700,
        title: 'Excise Inspection Manager - Surat',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        // icon: path.join(__dirname, 'assets', 'icon.png')
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    
    // Build menu
    const menuTemplate = [
        {
            label: 'ફાઇલ (File)',
            submenu: [
                { label: 'લાયસન્સી મેનેજમેન્ટ', click: () => mainWindow.webContents.send('navigate', 'licensees') },
                { label: 'નિરીક્ષણ અહેવાલ', click: () => mainWindow.webContents.send('navigate', 'inspection') },
                { type: 'separator' },
                { label: 'ડાયરી જનરેટ કરો', click: () => mainWindow.webContents.send('navigate', 'diary') },
                { label: 'કેલેન્ડર', click: () => mainWindow.webContents.send('navigate', 'calendar') },
                { type: 'separator' },
                { role: 'quit', label: 'બહાર નીકળો' }
            ]
        },
        {
            label: 'માહિતી (Data)',
            submenu: [
                { label: 'લાયસન્સ પ્રકારો', click: () => mainWindow.webContents.send('navigate', 'license-types') },
                { label: 'ઇન્સ્પેક્શન હિસ્ટરી', click: () => mainWindow.webContents.send('navigate', 'history') },
                { label: 'માસ્ટર ટેમ્પલેટ', click: () => mainWindow.webContents.send('navigate', 'templates') }
            ]
        },
        {
            label: 'રિપોર્ટ (Report)',
            submenu: [
                { label: 'માસિક ડાયરી (Word)', click: () => mainWindow.webContents.send('navigate', 'diary') },
                { label: 'ઈન્સ્પેક્શન સારાંશ', click: () => mainWindow.webContents.send('navigate', 'summary') },
                { type: 'separator' },
                { label: 'બાકી પરવાના', click: () => mainWindow.webContents.send('navigate', 'pending') }
            ]
        },
        {
            label: 'મદદ (Help)',
            submenu: [
                { label: 'આવૃત્તિ (Version)', click: () => showVersion() },
                { label: 'ડેવલપર', click: () => showDeveloper() }
            ]
        }
    ];
    
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
}

function showVersion() {
    dialog.showMessageBox(mainWindow, {
        title: 'Excise Inspection Manager',
        message: 'Excise Inspection Management System\nVersion 4.0\n\nFor: Superintendent, Prohibition & Excise\nSurat',
        type: 'info'
    });
}

function showDeveloper() {
    dialog.showMessageBox(mainWindow, {
        title: 'Developer',
        message: 'Developed by Batti 😇\nFor Shri Jignesh S Tanna\n\nMarch 2026',
        type: 'info'
    });
}

// IPC Handlers
ipcMain.handle('get-licensees', () => {
    return db.queryAll('SELECT * FROM licensees ORDER BY name');
});

ipcMain.handle('get-licensee-by-id', (event, id) => {
    const mgr = require('./src/modules/licensee-manager');
    return mgr.getLicensee(id);
});

ipcMain.handle('get-license-types', () => {
    return db.queryAll('SELECT * FROM license_types ORDER BY code');
});

ipcMain.handle('save-licensee', (event, data) => {
    const mgr = require('./src/modules/licensee-manager');
    if (data.id) {
        mgr.updateLicensee(data.id, data);
        return { success: true, id: data.id };
    } else {
        const id = mgr.addLicensee(data);
        return { success: true, id };
    }
});

ipcMain.handle('delete-licensee', (event, id) => {
    try {
        // First get all inspections for this licensee
        const inspections = db.queryAll('SELECT id FROM inspections WHERE licensee_id = @id', { id });
        for (const insp of inspections) {
            db.run('DELETE FROM inspection_fields WHERE inspection_id = @iid', { iid: insp.id });
            db.run('DELETE FROM inspection_photos WHERE inspection_id = @iid', { iid: insp.id });
            db.run('DELETE FROM inspection_report_files WHERE inspection_id = @iid', { iid: insp.id });
        }
        db.run('DELETE FROM inspections WHERE licensee_id = @id', { id });
        db.run('DELETE FROM licensee_licenses WHERE licensee_id = @id', { id });
        db.run('DELETE FROM reminders WHERE licensee_id = @id', { id });
        db.run('DELETE FROM licensees WHERE id = @id', { id });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-inspections-by-month', (event, month, year) => {
    const mgr = require('./src/modules/inspection-manager');
    return mgr.getByMonth(month, year);
});

ipcMain.handle('open-file', async (event, filePath) => {
    try {
        const { shell } = require('electron');
        const error = await shell.openPath(filePath);
        if (error) {
            return { success: false, error };
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('generate-diary', async (event, month, year) => {
    const diary = require('./src/modules/diary-generator');
    try {
        const data = diary.generateDiary(month, year);
        const filePath = await diary.exportToDocx(data);
        return { success: true, filePath, diary: data };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('export-diary-excel', async (event, month, year) => {
    const diary = require('./src/modules/diary-generator');
    try {
        const data = diary.generateDiary(month, year);
        const filePath = diary.exportToExcel(data);
        return { success: true, filePath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// == V4a: Export inspection to Excel ==
ipcMain.handle('export-inspection-excel', async (event, inspectionId) => {
    try {
        const mgr = require('./src/modules/inspection-manager');
        const filePath = mgr.exportToSpreadsheet(inspectionId);
        return { success: true, filePath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// == V4a: Export inspection to PDF ==
ipcMain.handle('export-inspection-pdf', async (event, inspectionId) => {
    const { BrowserWindow } = require('electron');
    try {
        const mgr = require('./src/modules/inspection-manager');
        const htmlContent = mgr.generateHtmlReport(inspectionId);
        
        // Ensure export directory exists
        const path = require('path');
        const fs = require('fs');
        const exportDir = path.join(__dirname, 'data', 'exported');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }
        
        // Get inspection for filename
        const insp = mgr.getInspection(inspectionId);
        const filePath = path.join(exportDir, 
            `Inspection-${insp.id}-${(insp.report_number || '').replace(/[/\\\s]/g, '_')}.pdf`);
        
        const win = new BrowserWindow({ show: false });
        win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
        
        return new Promise((resolve) => {
            win.webContents.on('did-finish-load', async () => {
                try {
                    const pdf = await win.webContents.printToPDF({
                        printBackground: true,
                        pageSize: 'A4',
                        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
                    });
                    fs.writeFileSync(filePath, pdf);
                    win.close();
                    resolve({ success: true, filePath });
                } catch (pdfError) {
                    win.close();
                    resolve({ success: false, error: pdfError.message });
                }
            });
            
            win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
                win.close();
                resolve({ success: false, error: errorDescription });
            });
        });
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// == V4a: Export all inspections for a month to Excel ==
ipcMain.handle('export-month-excel', async (event, month, year) => {
    try {
        const mgr = require('./src/modules/inspection-manager');
        const XLSX = require('xlsx');
        const path = require('path');
        const fs = require('fs');
        
        const inspections = mgr.getByMonth(month, year);
        if (!inspections || inspections.length === 0) {
            return { success: false, error: 'આ માસમાં કોઈ નિરીક્ષણ નથી.' };
        }

        const exportDir = path.join(__dirname, 'data', 'exported');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }

        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const filePath = path.join(exportDir, `All-Inspections-${monthNames[month-1]}-${year}.xlsx`);
        
        const wb = XLSX.utils.book_new();
        
        // Build summary data
        const header = ['ID', 'Report Number', 'Date', 'Time', 'License Type', 
                        'Licensee Name', 'Address', 'Area/GIDC', 'Location Visited',
                        'Vehicle', 'Distance (km)', 'Violations', 'Notes', 'Officer Remarks'];
        const rows = [header];
        
        for (const insp of inspections) {
            rows.push([
                insp.id,
                insp.report_number,
                insp.date_of_inspection,
                insp.time_of_inspection || '',
                insp.license_type_code || '',
                insp.licensee_name || '',
                insp.licensee_address || '',
                '', // area - not in joined query
                insp.to_location || '',
                insp.vehicle_details || '',
                insp.distance_km || 0,
                insp.violations_found || 'No',
                insp.violations_notes || '',
                insp.officer_remarks || ''
            ]);
        }
        
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
            {wch:6},{wch:25},{wch:14},{wch:10},{wch:12},
            {wch:30},{wch:30},{wch:15},{wch:20},
            {wch:15},{wch:10},{wch:10},{wch:30},{wch:30}
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Inspections');
        
        // Summary sheet
        const summaryRows = [
            ['Month', monthNames[month-1]],
            ['Year', year],
            ['Total Inspections', inspections.length],
            ['Violations Found', inspections.filter(i => i.violations_found === 'Yes').length],
            ['', ''],
            ['Generated On', new Date().toLocaleString('gu-IN')]
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
        XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

        XLSX.writeFile(wb, filePath);
        return { success: true, filePath, count: inspections.length };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('save-inspection', (event, data) => {
    const mgr = require('./src/modules/inspection-manager');
    try {
        const id = mgr.createInspection(data);
        return { success: true, id };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// == V4 FEATURES - BULK IMPORT ==
ipcMain.handle('bulk-import-preview', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Licensees ફાઇલ પસંદ કરો',
        filters: [
            { name: 'Excel/CSV Files', extensions: ['xlsx', 'xls', 'csv'] }
        ],
        properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) {
        return { success: false, canceled: true };
    }
    try {
        const bulk = require('./src/modules/bulk-import');
        const preview = bulk.previewFile(result.filePaths[0]);
        return { success: true, filePath: result.filePaths[0], preview };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('bulk-import-execute', (event, filePath) => {
    try {
        const bulk = require('./src/modules/bulk-import');
        const result = bulk.importFromFile(filePath);
        return { success: true, ...result };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('bulk-import-history', () => {
    const bulk = require('./src/modules/bulk-import');
    return bulk.getImportHistory();
});

// == V4 FEATURES - CUMULATIVE REPORT ==
ipcMain.handle('generate-cumulative-report', async (event, inspectionIds) => {
    try {
        const rg = require('./src/modules/report-generator');
        const filePath = await rg.generateCumulativeReport(inspectionIds);
        return { success: true, filePath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-report-files', (event, inspectionId) => {
    return db.queryAll(
        'SELECT * FROM inspection_report_files WHERE inspection_id = @id ORDER BY generated_date DESC',
        { id: inspectionId }
    );
});

// == V4 FEATURES - REPORT CRUD ==
ipcMain.handle('get-inspection-detail', (event, id) => {
    const mgr = require('./src/modules/inspection-manager');
    const insp = mgr.getInspection(id);
    if (!insp) return { success: false, error: 'નિરીક્ષણ મળ્યું નથી.' };
    // Add licensee info
    if (insp.licensee_id) {
        const licensee = db.queryOne('SELECT * FROM licensees WHERE id = @id', { id: insp.licensee_id });
        insp.licensee = licensee;
    }
    return { success: true, inspection: insp };
});

ipcMain.handle('update-inspection', (event, data) => {
    try {
        const db = require('./src/database/init');
        db.run(`
            UPDATE inspections SET
                report_number = @report_number,
                date_of_inspection = @date_of_inspection,
                time_of_inspection = @time_of_inspection,
                licensee_id = @licensee_id,
                to_location = @to_location,
                vehicle_details = @vehicle_details,
                distance_km = @distance_km,
                license_type_code = @license_type_code,
                violations_found = @violations_found,
                violations_notes = @violations_notes,
                applicable_rules = @applicable_rules,
                officer_remarks = @officer_remarks,
                subordinate_staff = @subordinate_staff,
                report_content = @report_content
            WHERE id = @id
        `, {
            id: data.id,
            report_number: data.report_number || '',
            date_of_inspection: data.date_of_inspection,
            time_of_inspection: data.time_of_inspection || '',
            licensee_id: data.licensee_id || null,
            to_location: data.to_location || '',
            vehicle_details: data.vehicle_details || '',
            distance_km: data.distance_km || 0,
            license_type_code: data.license_type_code || '',
            violations_found: data.violations_found || 'No',
            violations_notes: data.violations_notes || '',
            applicable_rules: data.applicable_rules || '',
            officer_remarks: data.officer_remarks || '',
            subordinate_staff: data.subordinate_staff || '',
            report_content: data.report_content || ''
        });

        // Update fields if provided
        if (data.fields && Array.isArray(data.fields)) {
            const mgr = require('./src/modules/inspection-manager');
            mgr.saveFields(data.id, data.fields);
        }

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('delete-inspection', (event, id) => {
    try {
        // Delete related data first
        db.run('DELETE FROM inspection_fields WHERE inspection_id = @id', { id });
        db.run('DELETE FROM inspection_photos WHERE inspection_id = @id', { id });
        db.run('DELETE FROM inspection_report_files WHERE inspection_id = @id', { id });
        db.run('DELETE FROM inspections WHERE id = @id', { id });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-all-diaries', () => {
    return db.queryAll('SELECT * FROM monthly_diaries ORDER BY year DESC, month DESC LIMIT 100');
});

ipcMain.handle('get-diary-detail', (event, id) => {
    const diary = require('./src/modules/diary-generator');
    const data = db.queryOne('SELECT * FROM monthly_diaries WHERE id = @id', { id });
    if (!data) return { success: false, error: 'ડાયરી મળી નથી.' };
    
    data.entries = db.queryAll('SELECT * FROM diary_entries WHERE diary_id = @id ORDER BY entry_date', { id });
    data.summary = db.queryAll('SELECT * FROM diary_summary WHERE diary_id = @id ORDER BY sr_no', { id });
    data.abstract = db.queryAll('SELECT * FROM diary_abstract WHERE diary_id = @id ORDER BY id', { id });
    
    return { success: true, diary: data };
});

ipcMain.handle('update-diary', (event, data) => {
    try {
        const diaryId = data.id;
        // Update basic info
        db.run('UPDATE monthly_diaries SET month = @m, year = @y WHERE id = @id', {
            m: data.month, y: data.year, id: diaryId
        });

        // Replace entries
        db.run('DELETE FROM diary_entries WHERE diary_id = @id', { id: diaryId });
        db.run('DELETE FROM diary_summary WHERE diary_id = @id', { id: diaryId });
        db.run('DELETE FROM diary_abstract WHERE diary_id = @id', { id: diaryId });

        if (data.entries) {
            for (const entry of data.entries) {
                db.insert(`
                    INSERT INTO diary_entries (diary_id, entry_date, from_location, to_location, vehicle, work_description)
                    VALUES (@did, @date, @from, @to, @vehicle, @work)
                `, {
                    did: diaryId, date: entry.entry_date, from: entry.from_location,
                    to: entry.to_location, vehicle: entry.vehicle, work: entry.work_description
                });
            }
        }
        if (data.summary) {
            for (const s of data.summary) {
                db.insert(`
                    INSERT INTO diary_summary (diary_id, sr_no, description, field_value)
                    VALUES (@did, @sr, @desc, @val)
                `, { did: diaryId, sr: s.sr_no, desc: s.description, val: s.field_value });
            }
        }
        if (data.abstract) {
            for (const a of data.abstract) {
                db.insert(`
                    INSERT INTO diary_abstract (diary_id, sr_no, license_type, inspection_standard,
                        total_licenses, inspected_this_month, remaining, progressive, category)
                    VALUES (@did, @sr, @lt, @std, @total, @inspected, @rem, @prog, @cat)
                `, {
                    did: diaryId, sr: a.sr_no, lt: a.license_type, std: a.inspection_standard,
                    total: a.total_licenses, inspected: a.inspected_this_month,
                    rem: a.remaining, prog: a.progressive, cat: a.category
                });
            }
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('delete-diary', (event, id) => {
    try {
        db.run('DELETE FROM diary_entries WHERE diary_id = @id', { id });
        db.run('DELETE FROM diary_summary WHERE diary_id = @id', { id });
        db.run('DELETE FROM diary_abstract WHERE diary_id = @id', { id });
        db.run('DELETE FROM monthly_diaries WHERE id = @id', { id });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// == V4 FEATURES - CALENDAR ==
ipcMain.handle('get-calendar-data', (event, month, year) => {
    const m = month.toString().padStart(2, '0');
    const y = year.toString();
    
    const inspections = db.queryAll(`
        SELECT i.id, i.date_of_inspection, i.license_type_code, i.violations_found,
               l.name as licensee_name
        FROM inspections i
        LEFT JOIN licensees l ON i.licensee_id = l.id
        WHERE substr(i.date_of_inspection, 6, 2) = @m
        AND substr(i.date_of_inspection, 1, 4) = @y
        ORDER BY i.date_of_inspection
    `, { m, y });

    const reminders = db.queryAll(`
        SELECT r.*, l.name as licensee_name
        FROM reminders r
        LEFT JOIN licensees l ON r.licensee_id = l.id
        WHERE substr(r.reminder_date, 6, 2) = @m
        AND substr(r.reminder_date, 1, 4) = @y
        ORDER BY r.reminder_date, r.reminder_time
    `, { m, y });

    return { inspections, reminders };
});

ipcMain.handle('get-inspections-by-date', (event, date) => {
    return db.queryAll(`
        SELECT i.*, l.name as licensee_name, l.address as licensee_address, l.gidc_area
        FROM inspections i
        LEFT JOIN licensees l ON i.licensee_id = l.id
        WHERE i.date_of_inspection = @date
        ORDER BY i.time_of_inspection
    `, { date });
});

ipcMain.handle('add-reminder', (event, data) => {
    const id = db.insert(`
        INSERT INTO reminders (reminder_date, reminder_time, title, description, licensee_id)
        VALUES (@reminder_date, @reminder_time, @title, @description, @licensee_id)
    `, data);
    return { success: true, id };
});

ipcMain.handle('complete-reminder', (event, id) => {
    db.run('UPDATE reminders SET is_completed = 1 WHERE id = @id', { id });
    return { success: true };
});

ipcMain.handle('delete-reminder', (event, id) => {
    db.run('DELETE FROM reminders WHERE id = @id', { id });
    return { success: true };
});

// == V4 FEATURES - WHATSAPP ==
ipcMain.handle('send-whatsapp-reminder', (event, options) => {
    const wa = require('./src/modules/whatsapp-alert');
    return wa.sendReminder(options);
});

ipcMain.handle('test-whatsapp', () => {
    const wa = require('./src/modules/whatsapp-alert');
    return wa.testConnection();
});

ipcMain.handle('get-whatsapp-settings', () => {
    const wa = require('./src/modules/whatsapp-alert');
    return wa.getSettings();
});

ipcMain.handle('save-whatsapp-settings', (event, settings) => {
    const wa = require('./src/modules/whatsapp-alert');
    return wa.saveSettings(settings);
});

// == V4c: DISTANCE CALCULATOR ==
ipcMain.handle('calculate-distance', async (event, address) => {
    const dc = require('./src/modules/distance-calculator');
    try {
        const result = await dc.calculateDistance(address);
        return result;
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// == V4c: LICENSE MAPPING ==
ipcMain.handle('get-licensee-licenses', (event, licenseeId) => {
    const mgr = require('./src/modules/licensee-manager');
    return mgr.getLicenseeLicenses(licenseeId);
});

ipcMain.handle('save-licensee-licenses', (event, data) => {
    try {
        const licenseeId = data.licensee_id;
        const licenseTypeIds = data.license_type_ids || [];
        // Remove existing mappings
        db.run('DELETE FROM licensee_licenses WHERE licensee_id = @id', { id: licenseeId });
        // Insert new mappings
        for (const typeId of licenseTypeIds) {
            db.insert(`
                INSERT INTO licensee_licenses (licensee_id, license_type_id, status)
                VALUES (@lid, @ltid, 'active')
            `, { lid: licenseeId, ltid: typeId });
        }
        return { success: true, count: licenseTypeIds.length };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-all-license-types', () => {
    return db.queryAll('SELECT * FROM license_types ORDER BY code');
});

ipcMain.handle('get-nokarnama-holders', () => {
    return db.queryAll("SELECT id, name, gidc_area, contact_person FROM licensees WHERE nokarnama_holder = 'Yes' ORDER BY name");
});

// == V4d: VEHICLE MASTER IPC HANDLERS ==
ipcMain.handle('get-vehicles', () => {
    return db.queryAll('SELECT * FROM vehicle_master WHERE is_active = 1 ORDER BY vehicle_number');
});

ipcMain.handle('add-vehicle', (event, vehicleNumber) => {
    try {
        const existing = db.queryOne('SELECT id FROM vehicle_master WHERE vehicle_number = @v', { v: vehicleNumber });
        if (existing) {
            // Reactivate if it was deactivated
            db.run('UPDATE vehicle_master SET is_active = 1 WHERE id = @id', { id: existing.id });
            return { success: true, id: existing.id };
        }
        const id = db.insert(
            'INSERT INTO vehicle_master (vehicle_number) VALUES (@v)',
            { v: vehicleNumber }
        );
        return { success: true, id };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('delete-vehicle', (event, id) => {
    try {
        db.run('UPDATE vehicle_master SET is_active = 0 WHERE id = @id', { id });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// == V4d: INSPECTION TEMPLATE IPC HANDLERS ==
ipcMain.handle('upload-inspection-template', async (event) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Upload Inspection Template Excel/CSV',
            filters: [
                { name: 'Excel/CSV Files', extensions: ['xlsx', 'xls', 'csv'] }
            ],
            properties: ['openFile']
        });
        if (result.canceled || !result.filePaths[0]) {
            return { success: false, canceled: true };
        }
        
        // Parse the template file
        const XLSX = require('xlsx');
        const path = require('path');
        const fs = require('fs');
        const filePath = result.filePaths[0];
        const ext = path.extname(filePath).toLowerCase();
        
        let wb;
        if (ext === '.csv') {
            const csvData = fs.readFileSync(filePath, 'utf8');
            wb = XLSX.read(csvData, { type: 'string', raw: true });
        } else {
            wb = XLSX.readFile(filePath, { raw: true });
        }
        
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        
        if (!rows || rows.length === 0) {
            return { success: false, error: 'ફાઇલમાં કોઈ ડેટા નથી.' };
        }
        
        let inserted = 0;
        let errors = [];
        
        for (const row of rows) {
            try {
                const licenseTypeCode = (row.license_type_code || '').toString().trim().toUpperCase();
                const fieldLabel = (row.field_label || '').toString().trim();
                if (!licenseTypeCode || !fieldLabel) {
                    errors.push('Missing license_type_code or field_label in row');
                    continue;
                }
                
                db.insert(`
                    INSERT INTO form_templates (license_type_code, field_label, field_type,
                        field_options, section_name, field_order, is_required)
                    VALUES (@code, @label, @type, @options, @section, @order, @required)
                `, {
                    code: licenseTypeCode,
                    label: fieldLabel,
                    type: (row.field_type || 'text').toString().trim(),
                    options: (function(){ var o = row.field_options; if (!o) return null; if (typeof o === 'string') { try { JSON.parse(o); return o; } catch(e) {} } return JSON.stringify(o); })(),
                    section: (row.section_name || '').toString().trim(),
                    order: parseInt(row.field_order) || 0,
                    required: row.is_required ? 1 : 0
                });
                inserted++;
            } catch (e) {
                errors.push(e.message);
            }
        }
        
        return { success: true, inserted, errors: errors.slice(0, 10) };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-inspection-template', (event, licenseTypeCode) => {
    return db.queryAll(
        'SELECT * FROM form_templates WHERE license_type_code = @code ORDER BY field_order, id',
        { code: licenseTypeCode }
    );
});

ipcMain.handle('get-all-templates', () => {
    return db.queryAll('SELECT * FROM form_templates ORDER BY license_type_code, field_order, id');
});

ipcMain.handle('delete-template', (event, id) => {
    try {
        db.run('DELETE FROM form_templates WHERE id = @id', { id });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Save inspection fields (for the inspection form)
ipcMain.handle('save-inspection-fields', (event, data) => {
    try {
        const mgr = require('./src/modules/inspection-manager');
        mgr.saveFields(data.inspection_id, data.fields);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-inspection-fields', (event, inspectionId) => {
    return db.queryAll(
        'SELECT * FROM inspection_fields WHERE inspection_id = @id ORDER BY field_order',
        { id: inspectionId }
    );
});

// == DRIVE SYNC IPC HANDLERS ==
ipcMain.handle('drive-upload-sync', async () => {
    const driveSync = require('./src/modules/drive-sync');
    return await driveSync.uploadToDrive();
});

ipcMain.handle('drive-download-sync', async () => {
    const driveSync = require('./src/modules/drive-sync');
    return await driveSync.downloadFromDrive();
});

ipcMain.handle('drive-sync-status', async () => {
    const driveSync = require('./src/modules/drive-sync');
    return driveSync.getSyncStatus();
});

// == V4 FEATURES - SETTINGS ==
ipcMain.handle('get-settings', () => {
    return db.queryAll('SELECT * FROM app_settings');
});

ipcMain.handle('save-settings', (event, settings) => {
    for (const [key, value] of Object.entries(settings)) {
        db.run(`
            INSERT OR REPLACE INTO app_settings (key, value) VALUES (@key, @value)
        `, { key, value: String(value) });
    }
    return { success: true };
});

app.whenReady().then(async () => {
    await createWindow();
    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
