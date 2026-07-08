const db = require('../database/init');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class DriveSync {
  constructor() {
    this.gog = 'C:\\Users\\hp\\.openclaw\\gog.exe';
    this.account = 'aryajignesh@gmail.com';
    this.dbPath = path.join(__dirname, '..', '..', 'data', 'excise_inspections.db');
    this.syncFileName = 'Excise-DB-Sync.db';
  }

  async uploadToDrive() {
    try {
      // First ensure DB is saved
      db.saveDatabase();
      
      // Check if file exists
      if (!fs.existsSync(this.dbPath)) {
        return { success: false, error: 'Database file not found at ' + this.dbPath };
      }

      const fileSize = fs.statSync(this.dbPath).size;
      console.log(`Uploading DB to Drive (${fileSize} bytes)...`);

      // Upload using gog (positional arg, not --file flag)
      const cmd = `& "${this.gog}" --account ${this.account} drive upload "${this.dbPath}" --name "${this.syncFileName}"`;
      const result = execSync(cmd, { timeout: 120000, shell: 'powershell.exe' });
      
      // Update last sync time
      db.run("UPDATE app_settings SET value = datetime('now','localtime') WHERE key = @key", { '@key': 'last_drive_sync' });
      
      return { success: true, message: result ? result.toString().trim() : 'Upload completed' };
    } catch(e) {
      return { success: false, error: e.message };
    }
  }

  async downloadFromDrive() {
    try {
      // Search for the file on Drive
      const searchCmd = `& "${this.gog}" --account ${this.account} drive search "${this.syncFileName}" --json`;
      const result = execSync(searchCmd, { timeout: 30000, shell: 'powershell.exe' });
      const output = result ? result.toString().trim() : '';
      
      let files;
      try {
        files = JSON.parse(output);
      } catch(e) {
        // Try to handle non-JSON output
        return { success: false, error: 'Could not parse Drive search results: ' + output.substring(0, 200) };
      }
      
      if (files && files.length > 0) {
        const fileId = files[0].id;
        console.log('Found sync file on Drive: ' + fileId);
        
        // Download to temp
        const tmpPath = this.dbPath + '.tmp';
        const downloadCmd = `& "${this.gog}" --account ${this.account} drive download ${fileId} --out "${tmpPath}"`;
        execSync(downloadCmd, { timeout: 120000, shell: 'powershell.exe' });
        
        if (!fs.existsSync(tmpPath)) {
          return { success: false, error: 'Downloaded file not found at temp path' };
        }
        
        // Close current DB and replace
        db.closeDatabase();
        fs.copyFileSync(tmpPath, this.dbPath);
        try { fs.unlinkSync(tmpPath); } catch(e) {}
        
        // Reinitialize DB
        await db.initAsync();
        
        // Update sync time
        db.run("UPDATE app_settings SET value = datetime('now','localtime') WHERE key = @key", { '@key': 'last_drive_sync' });
        
        return { success: true, fileId };
      }
      return { success: false, error: 'No sync file found on Drive. Upload first.' };
    } catch(e) {
      return { success: false, error: e.message };
    }
  }
  
  getSyncStatus() {
    try {
      const settings = db.queryAll("SELECT * FROM app_settings WHERE key IN ('last_drive_sync')");
      const lastSync = settings.length > 0 ? settings[0].value : null;
      
      let fileInfo = null;
      if (fs.existsSync(this.dbPath)) {
        const stat = fs.statSync(this.dbPath);
        fileInfo = {
          size: stat.size,
          modified: stat.mtime.toISOString()
        };
      }
      
      return { lastSync, fileInfo };
    } catch(e) {
      return { lastSync: null, fileInfo: null, error: e.message };
    }
  }
}

module.exports = new DriveSync();
