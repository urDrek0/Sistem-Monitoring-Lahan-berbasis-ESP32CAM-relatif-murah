const path = require('path');
const state = require('./state');

function notifyCaptureResult(filename) {
  if (state.pendingCaptures.length > 0) {
    const { resolve, timer } = state.pendingCaptures.shift();
    clearTimeout(timer);
    resolve(filename);
  } else {
    console.log('notifyCaptureResult: no pending capture to resolve');
  }
}

function registerExpectedPhoto(sensor) {
  console.log(`[Telegram] Mendaftarkan antrean foto yang diharapkan untuk sensor ${sensor}...`);
  const promise = new Promise((resolve) => {
    state.photoResolvers.set(sensor, resolve);
  });
  state.activePhotoUploads.set(sensor, promise);

  // 15 seconds timeout if upload fails to arrive from ESP32
  setTimeout(() => {
    if (state.photoResolvers.has(sensor)) {
      console.log(`[Telegram] Timeout menunggu foto dari sensor ${sensor} (15s), membebaskan antrean video.`);
      const resolve = state.photoResolvers.get(sensor);
      resolve();
      state.photoResolvers.delete(sensor);
      state.activePhotoUploads.delete(sensor);
    }
  }, 15000);
}

async function requestCapture(ctx, deviceId, requestId = 'default', waitingMsgId = null) {
  const { sendCaptureRequest } = require('../websocket');
  const sent = sendCaptureRequest(deviceId);
  if (!sent) {
    if (waitingMsgId) await ctx.telegram.editMessageText(ctx.chat.id, waitingMsgId, undefined, '❌ Kamera tidak tersedia atau sedang offline.').catch(() => { });
    return;
  }

  const TIMEOUT_MS = 45000; // 45 seconds

  try {
    const filename = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = state.pendingCaptures.findIndex(p => p.resolve === resolve);
        if (idx !== -1) state.pendingCaptures.splice(idx, 1);
        reject(new Error('timeout'));
      }, TIMEOUT_MS);
      state.pendingCaptures.push({ resolve, reject, timer, id: requestId });
    });

    if (waitingMsgId) await ctx.telegram.editMessageText(ctx.chat.id, waitingMsgId, undefined, '✅ Capture berhasil. Mengirim foto...').catch(() => { });

    const filePath = path.join(state.DATA_DIR, 'photos', filename);
    const caption = `📸 *Capture On-Demand*\n🕐 ${new Date().toLocaleTimeString('id-ID')} (WIB)`;
    const safeCaption = caption.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = ctx.chat.id;
    const cmd = `curl -s -X POST "https://api.telegram.org/bot${token}/sendPhoto" -F chat_id="${chatId}" -F photo="@${filePath}" -F caption="${safeCaption}" -F parse_mode="Markdown"`;

    await new Promise((resolve, reject) => {
      require('child_process').exec(cmd, (error, stdout) => {
        if (error) return reject(error);
        try {
          const res = JSON.parse(stdout);
          if (!res.ok) return reject(new Error(res.description));
          resolve(res);
        } catch (e) { reject(new Error("CURL error")); }
      });
    });
  } catch (err) {
    if (err.message === 'timeout') {
      await ctx.reply('⏱️ Timeout! Kamera tidak merespons dalam 45 detik.\nPastikan kamera terhubung dan coba lagi.');
    } else if (err.message === 'cancelled') {
      // User cancelled, do nothing
    } else {
      await ctx.reply(`❌ Gagal mengirim gambar: ${err.message}`);
    }
  }
}

module.exports = {
  notifyCaptureResult,
  registerExpectedPhoto,
  requestCapture
};
