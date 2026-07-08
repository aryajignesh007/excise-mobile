# Excise Inspection Management System

## Superintendent of Prohibition and Excise, Surat

**Developer:** Batti 😇  
**Client:** Shri Jignesh S Tanna  
**Version:** 1.0  

---

## 📋 System Overview

A Windows desktop application (EXE) for:
1. **Inspection Report Entry** — Dynamic forms per license type with editable master validation
2. **Licensee Database** — Track all licensees with names, addresses, contacts, license types
3. **GPS Photo Integration** — Attach GPS-tagged photos from field inspections
4. **Distance Calculator** — Auto-calculate km from Nanpura office to inspection site
5. **Monthly Diary Generator** — Auto-generate MS Word Diary from inspection data
6. **License Abstract** — Auto-populate license inspection counts, remaining, and progressive totals
7. **Calendar & Reminders** — Due inspections calendar with WhatsApp reminders
8. **Inspection Plan Optimizer** — Smart route planning based on must-inspect licensees

---

## 🏗️ Architecture

### Technology Stack
- **Frontend/Backend:** Electron (Chromium + Node.js)
- **Language:** JavaScript/HTML/CSS
- **Database:** SQLite (local, no server needed)
- **Excel Output:** `xlsx` library (same format as existing templates)
- **Word Output:** `docx` library (.docx format for MS Word)
- **Distance API:** Google Maps Distance Matrix API
- **WhatsApp:** `wacli` integration for reminders
- **Packaging:** electron-builder (single EXE installer)

### Database Schema

```
licensees
├── id, name, address, gidc_area, phone, email
├── contact_person, nokarnama_holder
├── lat, lng (for distance calc)
├── is_priority (must-inspect)
└── inspection_frequency

license_types
├── id, code (FL-1, M.A.-1, R.S.-2, etc.)
├── form_template_id (which form template to use)
└── inspection_standard (monthly/bi-monthly/etc.)

inspections
├── id, report_number, date, time
├── licensee_id, license_type_id
├── from_location (Nanpura)
├── vehicle_details
├── distance_km
├── violations_found (yes/no)
├── remarks
└── created_at

inspection_fields
├── id, inspection_id
├── field_key, field_value
└── section_name

photos
├── id, inspection_id
├── file_path, lat, lng
├── timestamp
└── caption

templates (Editable Master Template)
├── id, license_type_id
├── section_order, field_label
├── field_type (text/dropdown/checkbox)
├── dropdown_options
├── is_required
└── visibility_condition

monthly_diaries
├── id, month, year
├── reference_number
├── total_working_days, total_travel_days
└── generated_date

diary_entries
├── id, diary_id, date
├── from_loc, to_loc, vehicle
└── work_description
```

---

## 📁 Application Modules

### Module 1: Licensee Management
- Add/edit/delete licensees
- Store full details (name, address, GIDC area, contact person, phone, email)
- Mark as "must-inspect" / priority
- Track which license types they hold
- "Use Last Visit" button to pre-fill inspection form with previous data

### Module 2: Inspection Report Entry
- Select licensee from database (or add new)
- Select license type → form dynamically changes
- Enter inspection data in all sections
- Attach GPS-tagged photos
- Auto-calculates distance from Nanpura
- "Use Last Visit" checkbox to auto-fill permanent details
- Save as Excel (.xlsx) in the format matching Master Template
- Report number auto-generation: `IR/SPE/{year}/{licensee_code}/{month}/XX`

### Module 3: Editable Master Validation
- External .xltx file that sir can edit
- Add/remove/modify validation rules per license type
- Add/remove fields from inspection form
- Application reads this file on startup

### Module 4: Calendar & Reminders
- Calendar view showing due inspections per day
- Color coding: Green (done), Yellow (planned), Red (overdue)
- Set reminders for specific dates
- **WhatsApp reminder** on office number at 8:00 AM: "Today's inspections: X licensees in Y area"
- **WhatsApp alert** for overdue inspections

### Module 5: Monthly Diary Generator
- Select month/year
- Auto-generates:
  - ✅ Covering letter with reference number
  - ✅ Daily entries (Date, From [Nanpura], To [address], Vehicle, Work)
  - ✅ Monthly summary (working days, travel days, etc.)
  - ✅ License Abstract with auto-calculated:
    - માસ દરમ્યાન તપાસેલ પરવાના (counted from inspection reports)
    - બાકી રહેતા પરવાનાઓ (total - inspected)
    - પ્રોગ્રેસીવ (previous total + current month)
- Output: **MS Word (.docx)** format matching the diary format

### Module 6: Inspection Plan Optimizer
- Takes all must-inspect licensees with addresses
- Optimizes route by area (Sachin GIDC → Pandesara GIDC → Hazira → Palsana → etc.)
- Suggests day-by-day plan for the month
- Accounts for inspection frequency (monthly, bi-monthly, quarterly, yearly)

### Module 7: Lists & Reports
- License List (mapped from List_of_Licenses.xlsx)
- Inspection history per licensee
- Monthly/Yearly statistics
- Export reports

---

## 📂 Output File Formats

### Inspection Report → **Excel (.xlsx)**
- Same format as Master Templates shared by sir
- Both Methanol and F.L.-2 template variants supported
- Following the exact column/row layout of the existing forms

### Monthly Diary → **MS Word (.docx)**
- Full A4 format with:
  - Letterhead + covering letter
  - Date-wise table (Date, From, To & fro, Vehicle, કામગીરી)
  - Monthly summary statistics
  - License-wise abstract table (32 types, 4 categories)
- Preserving the Gujarati text format from the diary sample

### Photos → **JPEG with embedded EXIF GPS data**
- Accepted from GPS camera app
- Displayed in inspection report
- Stored locally with reference

---

## 📅 Development Phases

### Phase 1: Core Setup (Week 1)
- [ ] Project scaffolding (Electron + SQLite)
- [ ] Database schema creation
- [ ] Licensee CRUD module
- [ ] License types management
- [ ] Import List_of_Licenses data

### Phase 2: Inspection Forms (Week 1-2)
- [ ] Dynamic form rendering from Master Template
- [ ] All field types (text, dropdown, checkbox, date)
- [ ] License-type-based field visibility
- [ ] "Use Last Visit" feature
- [ ] Save as Excel (.xlsx)
- [ ] Photo attachment with GPS

### Phase 3: Distance & Map (Week 2)
- [ ] Google Maps Distance Matrix integration
- [ ] Auto-calculate km from Nanpura
- [ ] Store coordinates in database

### Phase 4: Calendar & Reminders (Week 2-3)
- [ ] Calendar view
- [ ] Due inspection tracking
- [ ] WhatsApp reminder integration (wacli)

### Phase 5: Diary Generator (Week 3)
- [ ] MS Word (.docx) generation
- [ ] Covering letter auto-fill
- [ ] Daily entries from inspection data
- [ ] License abstract auto-calculation
- [ ] Monthly summary calculation

### Phase 6: Plan Optimizer (Week 3-4)
- [ ] Priority-based scheduling
- [ ] Area-wise route optimization
- [ ] Day-by-day plan generation

### Phase 7: EXE Packaging (Week 4)
- [ ] electron-builder setup
- [ ] Single installer EXE
- [ ] Test installation on clean Windows

---

## 🔧 Instructions for Sir

### Editable Master Template Usage
The Master Template (.xltx) file sits alongside the EXE. Sir can:
1. Open the .xltx file in Excel
2. Add new rows for new validation rules
3. Modify dropdown options
4. Add new license types
5. Save → restart the EXE → changes apply

### Adding Licensees
- Via the app's "Licensee Management" screen
- Or import from Excel (bulk upload supported)

### Generating Monthly Diary
1. Go to "Diary Generator" module
2. Select month/year (e.g., July-2025)
3. Click "Generate"
4. System pulls all inspection data for that month
5. Auto-calculates all abstract values
6. Outputs .docx file ready to print

---

*Plan prepared for approval on 05-07-2026*
