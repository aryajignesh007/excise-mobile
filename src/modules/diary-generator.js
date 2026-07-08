const db = require('../database/init');
const licenseTypeManager = require('./license-type-manager');
const path = require('path');
const fs = require('fs');

class DiaryGenerator {
    // Generate monthly diary
    generateDiary(month, year) {
        const monthNames = ['જાન્યુઆરી','ફેબ્રુઆરી','માર્ચ','એપ્રિલ','મે','જૂન',
                           'જુલાઈ','ઓગસ્ટ','સપ્ટેમ્બર','ઓક્ટોબર','નવેમ્બર','ડિસેમ્બર'];
        const engMonthNames = ['January','February','March','April','May','June',
                              'July','August','September','October','November','December'];
        
        const monthName = monthNames[month - 1];
        const engMonth = engMonthNames[month - 1];
        
        // Get inspections for this month
        const inspections = db.queryAll(`
            SELECT i.*, l.name as licensee_name, l.address as licensee_address,
                   l.gidc_area, l.contact_person
            FROM inspections i 
            LEFT JOIN licensees l ON i.licensee_id = l.id
            WHERE strftime('%m', i.date_of_inspection) = ? 
            AND strftime('%Y', i.date_of_inspection) = ?
            ORDER BY i.date_of_inspection, i.time_of_inspection
        `, [month.toString().padStart(2, '0'), year.toString()]);

        // Get inspection counts by license type
        const typeCounts = db.queryAll(`
            SELECT i.license_type_code, COUNT(DISTINCT i.id) as count
            FROM inspections i
            WHERE strftime('%m', i.date_of_inspection) = ? 
            AND strftime('%Y', i.date_of_inspection) = ?
            GROUP BY i.license_type_code
        `, [month.toString().padStart(2, '0'), year.toString()]);

        // Get previous month progressive totals
        let prevProgressive = {};
        const prevDiary = db.queryOne(
            'SELECT id FROM monthly_diaries WHERE month = ? AND year = ?',
            [(month === 1 ? 12 : month - 1), (month === 1 ? year - 1 : year)]
        );
        if (prevDiary) {
            const prevData = db.queryAll(
                'SELECT * FROM diary_abstract WHERE diary_id = ?',
                [prevDiary.id]
            );
            for (const p of prevData) {
                prevProgressive[p.license_type] = p.progressive + p.inspected_this_month;
            }
        }

        // Build the diary data structure
        const diary = {
            month,
            year,
            monthName: `${monthName}-${year}`,
            engMonth: `${engMonth} ${year}`,
            referencePrefix: 'કપવ/૧-૨/૨૦૨૫/',
            date: new Date().toLocaleDateString('gu-IN'),
            
            // Daily entries
            dailyEntries: this.buildDailyEntries(inspections),
            
            // Monthly summary
            summary: this.buildSummary(inspections, month, year),
            
            // License abstract
            abstract: this.buildAbstract(typeCounts, prevProgressive)
        };

        // Save diary to database
        const diaryId = this.saveDiary(diary);
        diary.id = diaryId;

        return diary;
    }

    // Build daily entries from inspections
    buildDailyEntries(inspections) {
        const entries = {};
        
        for (const insp of inspections) {
            const dateKey = insp.date_of_inspection;
            if (!entries[dateKey]) {
                entries[dateKey] = {
                    date: dateKey,
                    from: 'SRT', // Surat (office)
                    to: insp.to_location || insp.licensee_address || '',
                    vehicle: 'G', // Government vehicle
                    work: ''
                };
            }
            
            // Build work description based on license type
            const licenseType = insp.license_type_code || '';
            const location = insp.licensee_address || '';
            const licenseeName = insp.licensee_name || '';
            
            if (insp.violations_found === 'Yes') {
                entries[dateKey].work += `તપાસણી ${licenseType} (${licenseeName})${insp.violations_notes ? ' - ' + insp.violations_notes : ''} | `;
            } else {
                entries[dateKey].work += `તપાસણી ${licenseType} (${licenseeName}) | `;
            }
        }

        // Fill in dates without inspections (office days)
        const filledEntries = this.fillCalendarDays(entries, inspections);
        
        return filledEntries.sort((a, b) => a.date.localeCompare(b.date));
    }

    // Fill calendar days with office entries for days without inspections
    fillCalendarDays(existingEntries, inspections) {
        const daysInMonth = new Date(inspections.length > 0 ? 
            new Date(inspections[0].date_of_inspection).getFullYear() : 2025,
            (inspections.length > 0 ? new Date(inspections[0].date_of_inspection).getMonth() : 0) + 1, 
            0).getDate();
        
        const year = inspections.length > 0 ? 
            new Date(inspections[0].date_of_inspection).getFullYear() : 2025;
        const month = inspections.length > 0 ? 
            new Date(inspections[0].date_of_inspection).getMonth() : 0;

        const result = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
            const dayOfWeek = new Date(dateStr).getDay();
            
            if (existingEntries[dateStr]) {
                result.push(existingEntries[dateStr]);
            } else {
                // Weekend check (0=Sun, 6=Sat)
                let work = 'કચેરી ખાતે કામગીરી';
                if (dayOfWeek === 0) {
                    work = 'જાહેર રજા';
                }
                
                result.push({
                    date: dateStr,
                    from: '-',
                    to: '-',
                    vehicle: '',
                    work: work
                });
            }
        }
        return result;
    }

    // Build monthly summary
    buildSummary(inspections, month, year) {
        const daysInMonth = new Date(year, month, 0).getDate();
        let workingDays = 0;
        let travelDays = 0;
        let totalInspected = 0;
        let deficiencies = 0;
        let publicityWork = 0;
        
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
            const dayOfWeek = new Date(dateStr).getDay();
            if (dayOfWeek !== 0) workingDays++; // Not Sunday
        }

        // Count travel days (days with inspections outside office)
        const daysWithTravel = new Set();
        for (const insp of inspections) {
            if (insp.to_location && insp.to_location !== '') {
                daysWithTravel.add(insp.date_of_inspection);
            }
            totalInspected++;
            if (insp.violations_found === 'Yes') deficiencies++;
        }
        travelDays = daysWithTravel.size;

        return [
            { sr: 1, description: 'માસ દરમ્યાન કામકાજના દિવસો', value: workingDays },
            { sr: 2, description: 'માસ દરમ્યાન કરેલ પ્રવાસના દિવસો', value: travelDays },
            { sr: 3, description: 'માસ દરમ્યાન તપાસેલ પરવાના', value: totalInspected },
            { sr: 4, description: 'શોધેલ ક્ષતિઓ', value: deficiencies },
            { sr: 5, description: 'માસ દરમ્યાન તપાસેલ તાબાની કચેરીની સંખ્યા', value: '-' },
            { sr: 6, description: 'પ્રચારની કામેગીરી', value: publicityWork || '-' }
        ];
    }

    // Build license abstract
    buildAbstract(typeCounts, prevProgressive) {
        // Define the 32 license types from the diary format
        const abstractTypes = [
            // Important licenses
            { sr: 1, code: 'FL1', name: 'એફ.એલ.-૧', standard: 'દર માસે', category: 'અગત્યના પરવાના' },
            { sr: 2, code: 'FL2', name: 'એફ.એલ.-૨', standard: 'દર માસે', category: 'અગત્યના પરવાના' },
            { sr: 3, code: 'M1', name: 'એમ-૧', standard: 'દર માસે', category: 'અગત્યના પરવાના' },
            { sr: 4, code: 'DISTL', name: 'ડીસ્ટીલરી', standard: 'દર માસે', category: 'અગત્યના પરવાના' },
            { sr: 5, code: 'DS1', name: 'ડી.એસ.-૧', standard: 'દર માસે', category: 'અગત્યના પરવાના' },
            // Main licenses
            { sr: 6, code: 'DS5', name: 'ડી.એસ.- ૫', standard: 'દર માસે', category: 'મુખ્ય પરવાના' },
            { sr: 7, code: 'DS6', name: 'ડી.એસ.- ૬', standard: 'દર માસે', category: 'મુખ્ય પરવાના' },
            { sr: 8, code: 'DS7', name: 'ડી.એસ.- ૭', standard: 'દર બે માસે', category: 'મુખ્ય પરવાના' },
            { sr: 9, code: 'DSP1', name: 'ડી.એસ.પી.- ૧', standard: 'દર માસે', category: 'મુખ્ય પરવાના' },
            { sr: 10, code: 'DSP4', name: 'ડી.એસ.પી.- ૪', standard: 'દર બે માસે', category: 'મુખ્ય પરવાના' },
            { sr: 11, code: 'RS1', name: 'આર.એસ.- ૧/૨', standard: 'દર ચાર માસે', category: 'મુખ્ય પરવાના' },
            { sr: 12, code: 'RS6', name: 'આર.એસ.- ૬', standard: 'દર માસે', category: 'મુખ્ય પરવાના' },
            { sr: 13, code: 'DD1', name: 'ડી.ડી.-૧', standard: 'દર માસે', category: 'મુખ્ય પરવાના' },
            { sr: 14, code: 'MF1', name: 'એમ.એફ.- ૧', standard: 'દર છ માસે', category: 'મુખ્ય પરવાના' },
            { sr: 15, code: 'N3', name: 'એન.-૩', standard: 'દર ત્રણ માસે', category: 'મુખ્ય પરવાના' },
            { sr: 16, code: 'N4', name: 'એન.-૪', standard: 'દર ત્રણ માસે', category: 'મુખ્ય પરવાના' },
            { sr: 17, code: 'SMP1', name: 'એસ.એમ.પી.- ૧', standard: 'દર ત્રણ માસે', category: 'મુખ્ય પરવાના' },
            { sr: 18, code: 'AC1', name: 'એ.સી.-૧', standard: 'દર બે માસે', category: 'મુખ્ય પરવાના' },
            { sr: 19, code: 'MA2', name: 'એમ.એ.-૨', standard: 'દર બે માસે', category: 'મુખ્ય પરવાના' },
            { sr: 20, code: 'RG1', name: 'આર.જી.-૧', standard: 'દર બે માસે', category: 'મુખ્ય પરવાના' },
            { sr: 21, code: 'SA1', name: 'એસ.એ.- ૧/૨', standard: 'દર બે માસે', category: 'મુખ્ય પરવાના' },
            { sr: '૨૧એ', code: 'FORM B', name: 'ફૉર્મ બી', standard: '-', category: 'મુખ્ય પરવાના' },
            // Minor licenses
            { sr: 22, code: 'DD2', name: 'ડી.ડી.-૨', standard: 'દર છ માસે', category: 'માઇનોર પરવાના' },
            { sr: 23, code: 'M2', name: 'એમ.-૨', standard: 'દર છ માસે', category: 'માઇનોર પરવાના' },
            { sr: 24, code: 'MF2', name: 'એમ.એફ.-૨', standard: 'દર છ માસે', category: 'માઇનોર પરવાના' },
            { sr: 25, code: 'AC2', name: 'એ.સી.-૨', standard: 'દર છ માસે', category: 'માઇનોર પરવાના' },
            { sr: 26, code: 'MA1', name: 'એમ.એ.-૧', standard: 'દર ત્રણ માસે', category: 'માઇનોર પરવાના' },
            // General licenses
            { sr: 27, code: 'DSP3', name: 'ડી.એસ.પી.-૩', standard: 'વર્ષે એક વખત', category: 'સામાન્ય પરવાના' },
            { sr: 28, code: 'DS2', name: 'ડી.એસ.-૨,૩,૪', standard: 'વર્ષે એક વખત', category: 'સામાન્ય પરવાના' },
            { sr: 29, code: 'SMP2', name: 'એસ.એમ.પી.-૨', standard: 'વર્ષે એક વખત', category: 'સામાન્ય પરવાના' },
            { sr: 30, code: 'OP2A', name: 'ઓ.પી.-૨એ', standard: '-', category: 'સામાન્ય પરવાના' },
            { sr: 31, code: 'B2A', name: 'બી-૨એ', standard: '-', category: 'સામાન્ય પરવાના' },
            { sr: 32, code: 'SW1', name: 'એસ. ડબ્લ્યુ.-૧', standard: '-', category: 'સામાન્ય પરવાના' }
        ];

        // Build lookup of counts from inspection data
        const countMap = {};
        for (const tc of typeCounts) {
            countMap[tc.license_type_code] = tc.count;
        }

        // Get total counts from license_types table
        const totalCounts = {};
        const allTypes = licenseTypeManager.getAll();
        for (const lt of allTypes) {
            totalCounts[lt.code] = lt.total_count || 0;
        }

        const result = [];
        let currentCategory = '';
        
        for (const at of abstractTypes) {
            const inspected = countMap[at.code] || 0;
            const total = totalCounts[at.code] || 0;
            const remaining = total - inspected;
            const progressive = (prevProgressive[at.code] || 0) + inspected;

            if (at.category !== currentCategory) {
                currentCategory = at.category;
                // Category header
                result.push({
                    isHeader: true,
                    category: currentCategory
                });
            }

            result.push({
                sr: at.sr,
                name: at.name,
                code: at.code,
                standard: at.standard,
                total: total,
                inspected: inspected,
                remaining: remaining < 0 ? 0 : remaining,
                progressive: progressive,
                category: at.category
            });
        }

        return result;
    }

    // Save diary to database
    saveDiary(diary) {
        // Check if diary already exists
        const existing = db.queryOne(
            'SELECT id FROM monthly_diaries WHERE month = ? AND year = ?',
            [diary.month, diary.year]
        );

        let diaryId;
        if (existing) {
            diaryId = existing.id;
            // Delete old entries
            db.run('DELETE FROM diary_entries WHERE diary_id = ?', [diaryId]);
            db.run('DELETE FROM diary_summary WHERE diary_id = ?', [diaryId]);
            db.run('DELETE FROM diary_abstract WHERE diary_id = ?', [diaryId]);
        } else {
            diaryId = db.insert(`
                INSERT INTO monthly_diaries (month, year, reference_number, month_name)
                VALUES (?, ?, ?, ?)
            `, [diary.month, diary.year, `${diary.referencePrefix}${diary.monthName}`, diary.monthName]);
        }

        // Save daily entries
        if (diary.dailyEntries) {
            for (const entry of diary.dailyEntries) {
                db.insert(`
                    INSERT INTO diary_entries (diary_id, entry_date, from_location, to_location, vehicle, work_description)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [diaryId, entry.date, entry.from, entry.to, entry.vehicle, entry.work]);
            }
        }

        // Save summary
        if (diary.summary) {
            for (const s of diary.summary) {
                db.insert(`
                    INSERT INTO diary_summary (diary_id, sr_no, description, field_value)
                    VALUES (?, ?, ?, ?)
                `, [diaryId, s.sr, s.description, s.value.toString()]);
            }
        }

        // Save abstract
        if (diary.abstract) {
            for (const a of diary.abstract) {
                if (a.isHeader) continue;
                db.insert(`
                    INSERT INTO diary_abstract (diary_id, sr_no, license_type, inspection_standard,
                        total_licenses, inspected_this_month, remaining, progressive, category)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [diaryId, a.sr.toString(), a.name, a.standard,
                    a.total, a.inspected, a.remaining, a.progressive, a.category]);
            }
        }

        return diaryId;
    }

    // Export diary to Word document
    exportToDocx(diary, outputPath) {
        // Ensure data/exported directory exists
        const exportDir = path.join(__dirname, '..', '..', 'data', 'exported');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }
        const Docx = require('docx');
        const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
                WidthType, AlignmentType, BorderStyle, HeadingLevel } = Docx;

        // Helper to create bordered cell
        const border = {
            top: { style: BorderStyle.SINGLE, size: 1 },
            bottom: { style: BorderStyle.SINGLE, size: 1 },
            left: { style: BorderStyle.SINGLE, size: 1 },
            right: { style: BorderStyle.SINGLE, size: 1 }
        };

        const makeCell = (text, options = {}) => {
            return new TableCell({
                children: [new Paragraph({
                    children: [new TextRun({ text: text.toString(), bold: options.bold, size: 20 })],
                    alignment: options.alignment || AlignmentType.LEFT
                })],
                width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
                ...border
            });
        };

        const sections = [];

        // Covering Letter Page
        sections.push({
            properties: {},
            children: [
                new Paragraph({ spacing: { after: 200 } }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                        new TextRun({ text: `ક્રમાંક:${diary.referencePrefix}`, size: 22 }),
                    ]
                }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                        new TextRun({ text: `તારીખ:    /     /${diary.year}`, size: 22 }),
                    ]
                }),
                new Paragraph({ spacing: { after: 200 } }),
                new Paragraph({
                    children: [new TextRun({ text: 'પ્રતિ ', size: 22, bold: true })],
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'મે. નિયામકશ્રી, નશાબંધી અને આબકારી ', size: 22 })],
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'નશાબંધી ભવન, સેક્ટર ૧૦બી, ', size: 22 })],
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'ગાંધીનગર-૩૮૨૦૧૦', size: 22 })],
                }),
                new Paragraph({ spacing: { after: 200 } }),
                new Paragraph({
                    children: [
                        new TextRun({ text: `વિષય : ડાયરી મોકલવા બાબત (${diary.engMonth})`, size: 22, bold: true }),
                    ],
                    alignment: AlignmentType.CENTER
                }),
                new Paragraph({ spacing: { after: 200 } }),
                new Paragraph({
                    children: [
                        new TextRun({ text: `ઉપરોક્ત વિષય પરત્વે આપ સાહેબની સૂચના અન્વયે જણાવવાનું કે, માહે-${diary.engMonth}ની કામગીરી દર્શાવતી ડાયરી આ સાથે સામેલ છે. જે આપ સાહેબશ્રીને વિદિત થવા વિનંતિ છે.`, size: 22 }),
                    ]
                }),
                new Paragraph({ spacing: { after: 200 } }),
                new Paragraph({
                    children: [
                        new TextRun({ text: `બિડાણ: માહે- ${diary.engMonth} ની ડાયરી`, size: 22 }),
                    ]
                }),
                new Paragraph({ spacing: { after: 400 } }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                        new TextRun({ text: '(જે. એસ. તન્ના)', size: 22 }),
                    ]
                }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                        new TextRun({ text: 'અધિક્ષક', size: 22 }),
                    ]
                }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                        new TextRun({ text: 'નશાબંધી અને આબકારી', size: 22 }),
                    ]
                }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                        new TextRun({ text: 'સુરત', size: 22 }),
                    ]
                }),
            ]
        });

        // Daily Diary Table
        const diaryHeaderRow = new TableRow({
            children: [
                makeCell('તારીખ', { bold: true, width: 15 }),
                makeCell('From', { bold: true, width: 10 }),
                makeCell('To & fro', { bold: true, width: 15 }),
                makeCell('Vehicle', { bold: true, width: 10 }),
                makeCell('કામગીરી', { bold: true, width: 50 }),
            ]
        });

        const diaryRows = [diaryHeaderRow];
        const monthMap = {
            'January': 'જાન્યુઆરી', 'February': 'ફેબ્રુઆરી', 'March': 'માર્ચ', 
            'April': 'એપ્રિલ', 'May': 'મે', 'June': 'જૂન',
            'July': 'જુલાઈ', 'August': 'ઓગસ્ટ', 'September': 'સપ્ટેમ્બર', 
            'October': 'ઓક્ટોબર', 'November': 'નવેમ્બર', 'December': 'ડિસેમ્બર'
        };

        for (const entry of diary.dailyEntries) {
            const dateObj = new Date(entry.date + 'T00:00:00');
            const day = dateObj.getDate();
            
            diaryRows.push(new TableRow({
                children: [
                    makeCell(day.toString(), { width: 15 }),
                    makeCell(entry.from, { width: 10 }),
                    makeCell(entry.to, { width: 15 }),
                    makeCell(entry.vehicle, { width: 10 }),
                    makeCell(entry.work, { width: 50 }),
                ]
            }));
        }

        sections.push({
            properties: {},
            children: [
                new Paragraph({ spacing: { before: 400 } }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ 
                            text: `અધિક્ષક નશાબંધી અને આબકારી, સુરતની માહે- ${diary.engMonth}ની ડાયરી`, 
                            size: 22, bold: true 
                        }),
                    ]
                }),
                new Paragraph({ spacing: { after: 200 } }),
                new Table({
                    rows: diaryRows,
                    width: { size: 100, type: WidthType.PERCENTAGE },
                }),
            ]
        });

        // Monthly Summary
        sections.push({
            properties: {},
            children: [
                new Paragraph({ spacing: { before: 400 } }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: `માહે-${diary.engMonth}ની તારીજ`, size: 22, bold: true }),
                    ]
                }),
                new Paragraph({ spacing: { after: 200 } }),
                new Table({
                    rows: [
                        new TableRow({ children: [
                            makeCell('અ.નં.', { bold: true, width: 10 }),
                            makeCell('કરેલ કામગીરીની વિગત', { bold: true, width: 60 }),
                            makeCell('નિયત દિવસ', { bold: true, width: 15 }),
                            makeCell('માસ દરમ્યાન', { bold: true, width: 15 }),
                        ]}),
                        ...diary.summary.map(s => new TableRow({ children: [
                            makeCell(s.sr.toString(), { width: 10 }),
                            makeCell(s.description, { width: 60 }),
                            makeCell('-', { width: 15 }),
                            makeCell(s.value.toString(), { width: 15 }),
                        ]}))
                    ],
                    width: { size: 100, type: WidthType.PERCENTAGE },
                }),
            ]
        });

        // License Abstract
        const absHeaderRow = new TableRow({
            children: [
                makeCell('અનુ. ક્રમ', { bold: true, width: 8 }),
                makeCell('પરવાનાનો પ્રકાર', { bold: true, width: 20 }),
                makeCell('પરવાના તપાસવાનું ધોરણ', { bold: true, width: 20 }),
                makeCell('પરવાનાની કુલ સંખ્યા', { bold: true, width: 14 }),
                makeCell('માસ દરમ્યાન તપાસેલ', { bold: true, width: 14 }),
                makeCell('તપાસવાનાં બાકી રહેતા', { bold: true, width: 14 }),
                makeCell('પ્રોગ્રેસીવ', { bold: true, width: 10 }),
            ]
        });

        const absRows = [absHeaderRow];
        
        // Add number row: 1,2,3,4,5,6,7
        absRows.push(new TableRow({
            children: [1,2,3,4,5,6,7].map(n => makeCell(n.toString(), { bold: true, width: 10 }))
        }));

        let lastCategory = '';
        for (const item of diary.abstract) {
            if (item.isHeader) {
                absRows.push(new TableRow({
                    children: [
                        makeCell('', { width: 8 }),
                        makeCell('', { width: 20 }),
                        makeCell(item.category, { bold: true, width: 20 }),
                        makeCell('', { width: 14 }),
                        makeCell('', { width: 14 }),
                        makeCell('', { width: 14 }),
                        makeCell('', { width: 10 }),
                    ]
                }));
                lastCategory = item.category;
                continue;
            }

            absRows.push(new TableRow({
                children: [
                    makeCell(item.sr.toString(), { width: 8 }),
                    makeCell(item.name, { width: 20 }),
                    makeCell(item.standard, { width: 20 }),
                    makeCell(item.total.toString(), { width: 14 }),
                    makeCell(item.inspected.toString(), { width: 14 }),
                    makeCell(item.remaining.toString(), { width: 14 }),
                    makeCell(item.progressive.toString(), { width: 10 }),
                ]
            }));
        }

        sections.push({
            properties: {},
            children: [
                new Paragraph({ spacing: { before: 400 } }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: 'માસિક ડાયરીનું એબ્સ્ટ્રેક્ટ', size: 22, bold: true }),
                    ]
                }),
                new Paragraph({ spacing: { after: 200 } }),
                new Table({
                    rows: absRows,
                    width: { size: 100, type: WidthType.PERCENTAGE },
                }),
                // Signature
                new Paragraph({ spacing: { before: 400 } }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: '(જે. એસ. તન્ના)', size: 22 })],
                }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: 'અધિક્ષક', size: 22 })],
                }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: 'નશાબંધી અને આબકારી', size: 22 })],
                }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: 'સુરત', size: 22 })],
                }),
            ]
        });

        // Create document
        const doc = new Document({
            sections: sections
        });

        // Generate output (use English month name for filename to avoid encoding issues)
        const outputFile = outputPath || path.join(exportDir, 
            `Diary-${diary.engMonth.replace(/[/ ]/g, '-')}.docx`);
        
        return Packer.toBuffer(doc).then(buffer => {
            fs.writeFileSync(outputFile, buffer);
            return outputFile;
        });
    }

    // Export diary to Excel spreadsheet
    exportToExcel(diary, outputPath) {
        const XLSX = require('xlsx');
        
        // Ensure data/exported directory exists
        const exportDir = path.join(__dirname, '..', '..', 'data', 'exported');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }

        const wb = XLSX.utils.book_new();

        // --- Sheet 1: Daily Diary ---
        const diaryHeader = ['તારીખ', 'From', 'To & fro', 'Vehicle', 'કામગીરી'];
        const diaryRows = [diaryHeader];
        for (const entry of diary.dailyEntries) {
            diaryRows.push([entry.date, entry.from, entry.to, entry.vehicle, entry.work]);
        }
        const ws1 = XLSX.utils.aoa_to_sheet(diaryRows);
        // Set column widths
        ws1['!cols'] = [{wch:14},{wch:10},{wch:20},{wch:10},{wch:60}];
        XLSX.utils.book_append_sheet(wb, ws1, 'ડાયરી');

        // --- Sheet 2: Monthly Summary ---
        const sumHeader = ['અ.નં.', 'કરેલ કામગીરીની વિગત', 'નિયત દિવસ', 'માસ દરમ્યાન'];
        const sumRows = [sumHeader];
        for (const s of diary.summary) {
            sumRows.push([s.sr, s.description, '-', s.value]);
        }
        const ws2 = XLSX.utils.aoa_to_sheet(sumRows);
        ws2['!cols'] = [{wch:8},{wch:50},{wch:15},{wch:15}];
        XLSX.utils.book_append_sheet(wb, ws2, 'સારાંશ');

        // --- Sheet 3: License Abstract ---
        const absHeader = ['અનુ.ક્રમ', 'પરવાનાનો પ્રકાર', 'ધોરણ', 'કુલ સંખ્યા', 'તપાસેલ', 'બાકી', 'પ્રોગ્રેસીવ'];
        const absRows = [absHeader];
        for (const item of diary.abstract) {
            if (item.isHeader) {
                absRows.push(['', '', item.category || '', '', '', '', '']);
                continue;
            }
            absRows.push([item.sr, item.name, item.standard, item.total, item.inspected, item.remaining, item.progressive]);
        }
        const ws3 = XLSX.utils.aoa_to_sheet(absRows);
        ws3['!cols'] = [{wch:10},{wch:22},{wch:18},{wch:12},{wch:12},{wch:12},{wch:12}];
        XLSX.utils.book_append_sheet(wb, ws3, 'એબ્સ્ટ્રેક્ટ');

        const outputFile = outputPath || path.join(exportDir, 
            `Diary-${diary.engMonth.replace(/[/ ]/g, '-')}.xlsx`);
        XLSX.writeFile(wb, outputFile);
        return outputFile;
    }

    // Get existing diary from DB
    getDiary(month, year) {
        const diary = db.queryOne(
            'SELECT * FROM monthly_diaries WHERE month = ? AND year = ?',
            [month, year]
        );
        if (!diary) return null;

        diary.entries = db.queryAll(
            'SELECT * FROM diary_entries WHERE diary_id = ? ORDER BY entry_date',
            [diary.id]
        );
        diary.summary = db.queryAll(
            'SELECT * FROM diary_summary WHERE diary_id = ? ORDER BY sr_no',
            [diary.id]
        );
        diary.abstract = db.queryAll(
            'SELECT * FROM diary_abstract WHERE diary_id = ? ORDER BY id',
            [diary.id]
        );

        return diary;
    }
}

module.exports = new DiaryGenerator();
