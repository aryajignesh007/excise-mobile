-- Excise Inspection Management System - Database Schema
-- Superintendent of Prohibition and Excise, Surat

-- Licensees master table
CREATE TABLE IF NOT EXISTS licensees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    gidc_area TEXT,
    city TEXT DEFAULT 'Surat',
    district TEXT DEFAULT 'Surat District',
    phone TEXT,
    email TEXT,
    contact_person TEXT,
    nokarnama_holder TEXT,
    latitude REAL,
    longitude REAL,
    is_priority INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- License types master (from List_of_Licenses)
CREATE TABLE IF NOT EXISTS license_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name_guj TEXT,
    description TEXT,
    category TEXT, -- Important/Main/Minor/General
    inspection_standard TEXT, -- દર માસે / દર બે માસે / etc
    total_count INTEGER DEFAULT 0,
    template_id INTEGER
);

-- Licensee-License mapping (which licenses a licensee holds)
CREATE TABLE IF NOT EXISTS licensee_licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    licensee_id INTEGER NOT NULL,
    license_type_id INTEGER NOT NULL,
    license_number TEXT,
    uln TEXT, -- Unique License Number
    validity_date TEXT,
    possession_limit TEXT,
    consumption_limit TEXT,
    purpose TEXT,
    status TEXT DEFAULT 'active',
    FOREIGN KEY (licensee_id) REFERENCES licensees(id),
    FOREIGN KEY (license_type_id) REFERENCES license_types(id)
);

-- Inspection reports
CREATE TABLE IF NOT EXISTS inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_number TEXT NOT NULL UNIQUE,
    date_of_inspection TEXT NOT NULL,
    time_of_inspection TEXT,
    licensee_id INTEGER,
    from_location TEXT DEFAULT 'Nanpura, Surat',
    to_location TEXT,
    vehicle_details TEXT,
    distance_km REAL DEFAULT 0,
    license_type_code TEXT,
    consolidated_report INTEGER DEFAULT 0,
    violations_found TEXT DEFAULT 'No',
    violations_notes TEXT,
    applicable_rules TEXT,
    officer_remarks TEXT,
    subordinate_staff TEXT,
    photos_json TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (licensee_id) REFERENCES licensees(id)
);

-- Dynamic inspection field values
CREATE TABLE IF NOT EXISTS inspection_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL,
    field_label TEXT NOT NULL,
    field_value TEXT,
    section_name TEXT,
    field_order INTEGER,
    FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
);

-- Inspection photos
CREATE TABLE IF NOT EXISTS inspection_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    timestamp TEXT,
    caption TEXT,
    FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
);

-- Form templates configuration (editable)
CREATE TABLE IF NOT EXISTS form_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_file TEXT, -- Path to .xltx file
    license_type_code TEXT,
    field_label TEXT NOT NULL,
    field_type TEXT DEFAULT 'text', -- text, dropdown, checkbox, date, textarea
    field_options TEXT, -- JSON array for dropdown options
    section_name TEXT,
    field_order INTEGER,
    is_required INTEGER DEFAULT 0,
    is_visible INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- Monthly diaries
CREATE TABLE IF NOT EXISTS monthly_diaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    reference_number TEXT,
    date_text TEXT,
    month_name TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(month, year)
);

-- Diary daily entries
CREATE TABLE IF NOT EXISTS diary_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    diary_id INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    from_location TEXT,
    to_location TEXT,
    vehicle TEXT,
    work_description TEXT,
    FOREIGN KEY (diary_id) REFERENCES monthly_diaries(id) ON DELETE CASCADE
);

-- Diary monthly summary
CREATE TABLE IF NOT EXISTS diary_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    diary_id INTEGER NOT NULL,
    sr_no INTEGER,
    description TEXT,
    field_value TEXT,
    FOREIGN KEY (diary_id) REFERENCES monthly_diaries(id) ON DELETE CASCADE
);

-- Diary license abstract
CREATE TABLE IF NOT EXISTS diary_abstract (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    diary_id INTEGER NOT NULL,
    sr_no INTEGER,
    license_type TEXT,
    inspection_standard TEXT,
    total_licenses INTEGER DEFAULT 0,
    inspected_this_month INTEGER DEFAULT 0,
    remaining INTEGER DEFAULT 0,
    progressive INTEGER DEFAULT 0,
    category TEXT,
    FOREIGN KEY (diary_id) REFERENCES monthly_diaries(id) ON DELETE CASCADE
);

-- Calendar reminders
CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_date TEXT NOT NULL,
    reminder_time TEXT,
    title TEXT,
    description TEXT,
    licensee_id INTEGER,
    is_completed INTEGER DEFAULT 0,
    whatsapp_sent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (licensee_id) REFERENCES licensees(id)
);

-- App settings
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('office_address', 'Nanpura, Surat');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('officer_name', 'Jignesh S Tanna');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('officer_designation', 'Superintendent');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('department', 'Prohibition and Excise Department, Surat');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('officer_contact', '9426583984');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('district', 'Surat District');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('office_latitude', '21.1811');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('office_longitude', '72.8075');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('diary_reference_prefix', 'કપવ/૧-૨/૨૦૨૫/');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('whatsapp_reminder_time', '08:00');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('whatsapp_enabled', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('whatsapp_account', 'personal');

-- Bulk import history
CREATE TABLE IF NOT EXISTS bulk_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    import_date TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    count_imported INTEGER DEFAULT 0,
    status TEXT DEFAULT 'completed'
);

-- Vehicle master table
CREATE TABLE IF NOT EXISTS vehicle_master (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_number TEXT NOT NULL UNIQUE,
    vehicle_type TEXT DEFAULT 'Official',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- Generated report file paths
CREATE TABLE IF NOT EXISTS inspection_report_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    generated_date TEXT DEFAULT (datetime('now','localtime')),
    report_type TEXT DEFAULT 'inspection',
    FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
);
