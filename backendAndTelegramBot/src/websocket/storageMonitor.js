const checkDiskSpace = require('check-disk-space').default;
const state = require('./state');
const { deleteOldestEvent, getLogs } = require('../services/sqllite_logger');

let isPurging = false;
let cachedStoragePayload = null;

function buildStoragePayload(diskSpace) {
  const total = diskSpace.size;
  const free = diskSpace.free;
  const used = total - free;
  const percentage = Math.round((used / total) * 100);

  return {
    type: 'storage_update',
    totalGb: (total / (1024 ** 3)).toFixed(1),
    usedGb: (used / (1024 ** 3)).toFixed(1),
    percentage
  };
}

function broadcastStoragePayload() {
  if (!state.wssInstance || !cachedStoragePayload) return;

  const storagePayload = JSON.stringify(cachedStoragePayload);
  state.wssInstance.clients.forEach(client => {
    if (client.readyState === 1 && client.path && !client.path.startsWith('/camera')) {
      client.send(storagePayload);
    }
  });
}

async function checkStorageAndPurge() {
  try {
    const rootPath = process.platform === 'win32' ? 'C:/' : '/';
    const diskSpace = await checkDiskSpace(rootPath);

    cachedStoragePayload = buildStoragePayload(diskSpace);
    const percentage = cachedStoragePayload.percentage;

    // 1. Broadcast Info Storage ke Web Kiosk
    broadcastStoragePayload();

    // 2. Logika Auto-Purge (Bersihkan jika memori sentuh 90%)
    if (percentage >= 90 && !isPurging) {
      console.log(`[Storage] ALARM: Disk usage at ${percentage}%. Starting auto-purge...`);
      isPurging = true;
      let currentPercentage = percentage;

      // Looping hapus data terlama sampai storage turun di bawah 50%
      while (currentPercentage > 50) {
        const deleted = deleteOldestEvent();
        if (!deleted) break; // Berhenti jika array log.json sudah kosong

        // Re-check kapasitas disk setelah menghapus satu event
        const newDiskSpace = await checkDiskSpace(rootPath);
        cachedStoragePayload = buildStoragePayload(newDiskSpace);
        currentPercentage = cachedStoragePayload.percentage;
      }

      console.log(`[Storage] Auto-purge complete. Disk usage dropped to ${currentPercentage}%.`);
      isPurging = false;
      broadcastStoragePayload();

      // Broadcast log terbaru ke Dashboard Kiosk karena datanya banyak yang dihapus
      if (state.wssInstance) {
        const logsPayload = JSON.stringify({ type: 'historical_logs', logs: getLogs() });
        state.broadcastToKiosks(logsPayload);
      }
    }
  } catch (err) {
    console.error('[Storage] Error checking disk space:', err);
  }
}

function getCachedStoragePayload() {
  return cachedStoragePayload;
}

// Jalankan fungsi check memori setiap 1 Menit
setInterval(checkStorageAndPurge, 60 * 1000);

// Panggil paksa 1 kali saat server baru menyala (agar tidak perlu nunggu 1 menit pertama)
checkStorageAndPurge();

module.exports = {
  checkStorageAndPurge,
  getCachedStoragePayload
};
