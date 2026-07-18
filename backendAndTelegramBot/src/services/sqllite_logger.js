const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '../../../data');
const DB_FILE_PATH = path.join(DATA_DIR, 'logs.db');
const OLD_JSON_PATH = path.join(DATA_DIR, 'log.json');
const BACKUP_JSON_PATH = path.join(DATA_DIR, 'log.json.backup');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize SQLite database
const db = new Database(DB_FILE_PATH);

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    sensor TEXT,
    location TEXT,
    deviceId TEXT,
    timestamp TEXT,
    imageUrl TEXT,
    videoUrl TEXT,
    humanPresence INTEGER,
    aiDetails TEXT
  )
`);


// Prepared statements for better performance
const insertLogStmt = db.prepare(`
  INSERT INTO logs (type, sensor, location, deviceId, timestamp, imageUrl, videoUrl, humanPresence, aiDetails)
  VALUES (@type, @sensor, @location, @deviceId, @timestamp, @imageUrl, @videoUrl, @humanPresence, @aiDetails)
`);

const getAllLogsStmt = db.prepare('SELECT * FROM logs ORDER BY timestamp ASC');

// Use subquery with limit 1 instead of UPDATE ... LIMIT 1 for standard SQLite compatibility
const updateLogWithAiStmt = db.prepare(`
  UPDATE logs 
  SET imageUrl = ?, humanPresence = ?, aiDetails = ? 
  WHERE id = (
    SELECT id FROM logs 
    WHERE sensor = ? AND deviceId = ? AND imageUrl IS NULL AND timestamp >= ? 
    ORDER BY timestamp DESC LIMIT 1
  )
`);

const updateLogWithVideoStmt = db.prepare(`
  UPDATE logs 
  SET videoUrl = ? 
  WHERE id = (
    SELECT id FROM logs 
    WHERE sensor = ? AND deviceId = ? AND videoUrl IS NULL 
    ORDER BY timestamp DESC LIMIT 1
  )
`);

function mapRowToLog(row) {
  return {
    id: row.id,
    type: row.type,
    sensor: row.sensor,
    location: row.location,
    deviceId: row.deviceId,
    timestamp: row.timestamp,
    imageUrl: row.imageUrl,
    videoUrl: row.videoUrl,
    humanPresence: row.humanPresence === 1,
    aiDetails: row.aiDetails ? JSON.parse(row.aiDetails) : null
  };
}

function logEvent(eventData) {
  try {
    insertLogStmt.run({
      type: eventData.type || null,
      sensor: eventData.sensor || null,
      location: eventData.location || null,
      deviceId: eventData.deviceId || null,
      timestamp: eventData.timestamp || new Date().toISOString(),
      imageUrl: eventData.imageUrl || null,
      videoUrl: eventData.videoUrl || null,
      humanPresence: eventData.humanPresence ? 1 : 0,
      aiDetails: eventData.aiDetails ? JSON.stringify(eventData.aiDetails) : null
    });
  } catch (error) {
    console.error('Error inserting log into SQLite:', error);
  }
}

function getLogs() {
  try {
    const rows = getAllLogsStmt.all();
    return rows.map(mapRowToLog);
  } catch (error) {
    console.error('Error reading logs from SQLite:', error);
    return [];
  }
}

async function updateLatestLogWithAI(sensor, deviceIp, imageUrl, humanPresence, aiDetails) {
  const deviceId = `cam_${deviceIp.replace(/\./g, '_')}`;
  
  try {
    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
    const info = updateLogWithAiStmt.run(
      imageUrl, 
      humanPresence ? 1 : 0, 
      aiDetails ? JSON.stringify(aiDetails) : null,
      sensor, 
      deviceId,
      tenSecondsAgo
    );
    
    if (info.changes > 0) {
      console.log(`[Logger] Successfully updated PIR log with photo.`);
    } else {
      // Fallback: create a new log entry
      logEvent({
        type: 'motion_event',
        sensor: sensor,
        location: deviceIp,
        deviceId: deviceId,
        imageUrl: imageUrl,
        humanPresence: humanPresence,
        aiDetails: aiDetails,
        timestamp: new Date().toISOString()
      });
      console.log(`[Logger] Fallback triggered: Created new PIR log entry with photo.`);
    }
  } catch (error) {
    console.error('Error updating log with AI:', error);
  }
}

function updateLatestLogVideo(sensor, deviceIp, videoUrl) {
  try {
    const deviceId = `cam_${deviceIp.replace(/\./g, '_')}`;
    updateLogWithVideoStmt.run(videoUrl, sensor, deviceId);
  } catch (error) {
    console.error('Error updating log with video:', error);
  }
}

// --- STORAGE MANAGEMENT ---

function deleteFileSafely(fileUrl, folderName) {
  if (!fileUrl) return;
  const fileName = fileUrl.split('/').pop();
  const filePath = path.join(DATA_DIR, folderName, fileName);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`[Storage] Deleted file: ${fileName}`);
    } catch (err) {
      console.error(`[Storage] Failed to delete file ${fileName}:`, err.message);
    }
  }
}

function deleteEventSingle(timestamp) {
  try {
    const row = db.prepare('SELECT * FROM logs WHERE timestamp = ?').get(timestamp);
    if (row) {
      if (row.imageUrl) deleteFileSafely(row.imageUrl, 'photos');
      if (row.videoUrl) deleteFileSafely(row.videoUrl, 'videos');
      
      db.prepare('DELETE FROM logs WHERE id = ?').run(row.id);
      return true;
    }
  } catch (error) {
    console.error('Error in deleteEventSingle:', error);
  }
  return false;
}

function deleteEventsByDate(dateString) { // format dateString: "YYYY-MM-DD"
  try {
    const rows = db.prepare("SELECT * FROM logs").all();
    const idsToDelete = [];
    
    for (const row of rows) {
      const logDate = new Date(row.timestamp);
      // Ubah timestamp menjadi format YYYY-MM-DD sesuai waktu lokal
      const localDateStr = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`;
      
      if (localDateStr === dateString) {
        if (row.imageUrl) deleteFileSafely(row.imageUrl, 'photos');
        if (row.videoUrl) deleteFileSafely(row.videoUrl, 'videos');
        idsToDelete.push(row.id);
      }
    }
    
    if (idsToDelete.length > 0) {
      // Chunking if there are too many IDs (sqlite limit is 999 vars)
      const chunkSize = 500;
      for (let i = 0; i < idsToDelete.length; i += chunkSize) {
        const chunk = idsToDelete.slice(i, i + chunkSize);
        const deleteStmt = db.prepare(`DELETE FROM logs WHERE id IN (${chunk.map(() => '?').join(',')})`);
        deleteStmt.run(...chunk);
      }
      return true;
    }
  } catch (error) {
    console.error('Error in deleteEventsByDate:', error);
  }
  return false;
}

function deleteOldestEvent() {
  try {
    const row = db.prepare('SELECT * FROM logs ORDER BY timestamp ASC LIMIT 1').get();
    if (row) {
      if (row.imageUrl) deleteFileSafely(row.imageUrl, 'photos');
      if (row.videoUrl) deleteFileSafely(row.videoUrl, 'videos');
      
      db.prepare('DELETE FROM logs WHERE id = ?').run(row.id);
      return true;
    }
  } catch (error) {
    console.error('Error in deleteOldestEvent:', error);
  }
  return false;
}

module.exports = {
  logEvent,
  getLogs,
  updateLatestLogWithAI,
  updateLatestLogVideo,
  deleteEventSingle,
  deleteEventsByDate,
  deleteOldestEvent
};