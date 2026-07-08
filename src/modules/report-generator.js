const db = require('../database/init');
const path = require('path');
const fs = require('fs');

class ReportGenerator {
    /**
     * Generate a cumulative DOCX report for multiple inspections
     * @param {Array} inspectionIds - Array of inspection IDs
     * @param {string} outputPath - Optional output file path
     * @returns {Promise<string>} - Path to generated report file
     */
    async generateCumulativeReport(inspectionIds, outputPath) {
        if (!inspectionIds || inspectionIds.length === 0) {
            throw new Error('કૃપા કરીને ઓછામાં ઓછું એક નિરીક્ષણ પસંદ કરો.');
        }

        // Fetch all inspections with licensee details
        const inspections = [];
        for (const id of inspectionIds) {
            const insp = db.queryOne(`
                SELECT i.*, l.name as licensee_name, l.address as licensee_address,
                       l.gidc_area, l.contact_person, l.phone as licensee_phone,
                       l.nokarnama_holder
                FROM inspections i
                LEFT JOIN licensees l ON i.licensee_id = l.id
                WHERE i.id = @id
            `, { id });

            if (insp) {
                insp.fields = db.queryAll(
                    'SELECT * FROM inspection_fields WHERE inspection_id = @id ORDER BY field_order',
                    { id }
                );
                inspections.push(insp);
            }
        }

        if (inspections.length === 0) {
            throw new Error('કોઈ નિરીક્ષણ મળ્યું નથી.');
        }

        // Get settings
        const officerName = this._getSetting('officer_name', 'Jignesh S Tanna');
        const officerDesignation = this._getSetting('officer_designation', 'Superintendent');
        const department = this._getSetting('department', 'Prohibition and Excise Department, Surat');

        // Build report content (text body for DB storage)
        const reportLines = [];
        reportLines.push('=== ક્યુમ્યુલેટિવ નિરીક્ષણ અહેવાલ ===');
        reportLines.push('');
        reportLines.push(`અધિકારી: ${officerName}`);
        reportLines.push(`હોદ્દો: ${officerDesignation}`);
        reportLines.push(`વિભાગ: ${department}`);
        reportLines.push(`કુલ નિરીક્ષણ: ${inspections.length}`);
        reportLines.push(`તારીખ: ${new Date().toLocaleDateString('gu-IN')}`);
        reportLines.push('');
        reportLines.push('='.repeat(60));
        reportLines.push('');

        for (const insp of inspections) {
            reportLines.push(`--- નિરીક્ષણ #${insp.id} ---`);
            reportLines.push(`રિપોર્ટ નંબર: ${insp.report_number}`);
            reportLines.push(`તારીખ: ${insp.date_of_inspection}`);
            reportLines.push(`સમય: ${insp.time_of_inspection || 'N/A'}`);
            reportLines.push(`લાયસન્સી: ${insp.licensee_name || 'N/A'}`);
            reportLines.push(`સરનામું: ${insp.licensee_address || 'N/A'}`);
            reportLines.push(`વિસ્તાર: ${insp.gidc_area || 'N/A'}`);
            reportLines.push(`લાયસન્સ પ્રકાર: ${insp.license_type_code || 'N/A'}`);
            reportLines.push(`સ્થળ: ${insp.to_location || 'N/A'}`);
            reportLines.push(`વાહન: ${insp.vehicle_details || 'N/A'}`);
            
            if (insp.fields && insp.fields.length > 0) {
                reportLines.push('વિગતવાર માહિતી:');
                for (const f of insp.fields) {
                    reportLines.push(`  ${f.field_label}: ${f.field_value || '-'}`);
                }
            }
            
            reportLines.push(`ક્ષતિઓ: ${insp.violations_found}`);
            if (insp.violations_found === 'Yes') {
                reportLines.push(`ક્ષતિઓની નોંધ: ${insp.violations_notes || '-'}`);
            }
            reportLines.push(`અધિકારીની ટિપ્પણી: ${insp.officer_remarks || '-'}`);
            reportLines.push('');
        }

        const reportContent = reportLines.join('\n');

        // Generate DOCX using docx library
        const Docx = require('docx');
        const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
                WidthType, AlignmentType, BorderStyle, HeadingLevel } = Docx;

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

        const children = [];

        // Title
        children.push(new Paragraph({ spacing: { after: 200 } }));
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'સંયુક્ત નિરીક્ષણ અહેવાલ', size: 28, bold: true })]
        }));
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Cumulative Inspection Report', size: 24 })]
        }));
        children.push(new Paragraph({ spacing: { after: 200 } }));

        // Header info
        children.push(new Paragraph({
            children: [new TextRun({ text: `અધિકારી: ${officerName}`, size: 22 })]
        }));
        children.push(new Paragraph({
            children: [new TextRun({ text: `હોદ્દો: ${officerDesignation}`, size: 22 })]
        }));
        children.push(new Paragraph({
            children: [new TextRun({ text: `વિભાગ: ${department}`, size: 22 })]
        }));
        children.push(new Paragraph({
            children: [new TextRun({ text: `કુલ નિરીક્ષણ: ${inspections.length}`, size: 22 })]
        }));
        children.push(new Paragraph({
            children: [new TextRun({ text: `જનરેટ તારીખ: ${new Date().toLocaleDateString('gu-IN')}`, size: 22 })]
        }));

        // Inspection summary table
        children.push(new Paragraph({ spacing: { before: 300 } }));
        children.push(new Paragraph({
            children: [new TextRun({ text: 'નિરીક્ષણ સારાંશ', size: 22, bold: true })]
        }));

        const headerRow = new TableRow({
            children: [
                makeCell('ક્રમ', { bold: true, width: 8 }),
                makeCell('રિપોર્ટ નં.', { bold: true, width: 20 }),
                makeCell('તારીખ', { bold: true, width: 15 }),
                makeCell('લાયસન્સી', { bold: true, width: 27 }),
                makeCell('પ્રકાર', { bold: true, width: 15 }),
                makeCell('ક્ષતિ', { bold: true, width: 15 }),
            ]
        });

        const dataRows = [headerRow];
        let idx = 1;
        for (const insp of inspections) {
            dataRows.push(new TableRow({
                children: [
                    makeCell(idx.toString(), { width: 8 }),
                    makeCell(insp.report_number, { width: 20 }),
                    makeCell(insp.date_of_inspection, { width: 15 }),
                    makeCell(insp.licensee_name || '-', { width: 27 }),
                    makeCell(insp.license_type_code || '-', { width: 15 }),
                    makeCell(insp.violations_found || 'No', { width: 15 }),
                ]
            }));
            idx++;
        }

        children.push(new Table({
            rows: dataRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
        }));

        // Details for each inspection
        for (const insp of inspections) {
            children.push(new Paragraph({ spacing: { before: 400 } }));
            children.push(new Paragraph({
                children: [new TextRun({ text: `નિરીક્ષણ #${insp.id} - ${insp.licensee_name || 'N/A'}`, size: 22, bold: true })]
            }));
            children.push(new Paragraph({
                children: [new TextRun({ text: `રિપોર્ટ નંબર: ${insp.report_number}`, size: 20 })]
            }));
            children.push(new Paragraph({
                children: [new TextRun({ text: `તારીખ: ${insp.date_of_inspection} | સમય: ${insp.time_of_inspection || 'N/A'}`, size: 20 })]
            }));
            children.push(new Paragraph({
                children: [new TextRun({ text: `લાયસન્સી: ${insp.licensee_name || 'N/A'} (${insp.licensee_address || 'N/A'})`, size: 20 })]
            }));
            children.push(new Paragraph({
                children: [new TextRun({ text: `લાયસન્સ પ્રકાર: ${insp.license_type_code || 'N/A'}`, size: 20 })]
            }));
            children.push(new Paragraph({
                children: [new TextRun({ text: `સ્થળ: ${insp.to_location || 'N/A'}`, size: 20 })]
            }));
            children.push(new Paragraph({
                children: [new TextRun({ text: `વાહન: ${insp.vehicle_details || 'N/A'}`, size: 20 })]
            }));

            if (insp.fields && insp.fields.length > 0) {
                children.push(new Paragraph({
                    children: [new TextRun({ text: 'વિગતવાર માહિતી:', size: 20, bold: true })]
                }));
                for (const f of insp.fields) {
                    children.push(new Paragraph({
                        children: [new TextRun({ text: `  ${f.field_label}: ${f.field_value || '-'}`, size: 20 })]
                    }));
                }
            }

            children.push(new Paragraph({
                children: [new TextRun({ text: `ક્ષતિઓ: ${insp.violations_found}`, size: 20 })]
            }));
            if (insp.violations_found === 'Yes') {
                children.push(new Paragraph({
                    children: [new TextRun({ text: `નોંધ: ${insp.violations_notes || '-'}`, size: 20 })]
                }));
            }
            if (insp.officer_remarks) {
                children.push(new Paragraph({
                    children: [new TextRun({ text: `અધિકારી ટિપ્પણી: ${insp.officer_remarks}`, size: 20 })]
                }));
            }
        }

        // Signature
        children.push(new Paragraph({ spacing: { before: 500 } }));
        children.push(new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `(${officerName})`, size: 22 })]
        }));
        children.push(new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: officerDesignation, size: 22 })]
        }));

        const doc = new Document({
            sections: [{ properties: {}, children }]
        });

        // Generate output file
        const dataDir = path.join(__dirname, '..', '..', 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const outputFile = outputPath || path.join(dataDir, `Cumulative-Report-${timestamp}.docx`);

        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(outputFile, buffer);

        // Save report content to DB for the first inspection (or save to all)
        for (const insp of inspections) {
            // Save report file record
            db.insert(`
                INSERT INTO inspection_report_files (inspection_id, file_path, report_type)
                VALUES (@inspection_id, @file_path, 'cumulative')
            `, { inspection_id: insp.id, file_path: outputFile });
            
            // Save report content
            db.run(`UPDATE inspections SET report_content = @content WHERE id = @id`, {
                content: reportContent,
                id: insp.id
            });
        }

        return outputFile;
    }

    // Generate DOCX for a single inspection
    async generateSingleReport(inspectionId, outputPath) {
        const insp = db.queryOne(`
            SELECT i.*, l.name as licensee_name, l.address as licensee_address,
                   l.gidc_area, l.contact_person, l.phone as licensee_phone
            FROM inspections i
            LEFT JOIN licensees l ON i.licensee_id = l.id
            WHERE i.id = @id
        `, { id: inspectionId });

        if (!insp) throw new Error('નિરીક્ષણ મળ્યું નથી.');

        insp.fields = db.queryAll(
            'SELECT * FROM inspection_fields WHERE inspection_id = @id ORDER BY field_order',
            { id: inspectionId }
        );

        return this.generateCumulativeReport([inspectionId], outputPath);
    }

    _getSetting(key, defaultVal) {
        const row = db.queryOne('SELECT value FROM app_settings WHERE key = @key', { key });
        return row ? row.value : defaultVal;
    }
}

module.exports = new ReportGenerator();
