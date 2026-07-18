const path = require('path');
const fs = require('fs');
const state = require('./state');
const bot = require('./bot');
const { getLatestImageFilename } = require('./commands');

async function sendMotionAlert(location, sensor, filename = null) {
  const uploadPromise = (async () => {
    console.log(`Attempting to send Telegram alert for ${location} (${sensor})...`);
    if (state.registeredChatIds.length === 0) {
      console.log('No chat IDs registered for Telegram alerts.');
      return;
    }

    const message = `🚨 *MOTION DETECTED!* \n\n📍 *Location:* ${location}\n🛡️ *Sensor:* ${sensor}\n⏰ *Time:* ${new Date().toLocaleTimeString()}`;
    const targetFilename = filename || getLatestImageFilename();

    let imageBuffer = null;
    if (targetFilename) {
      try {
        imageBuffer = fs.readFileSync(path.join(state.DATA_DIR, 'photos', targetFilename));
      } catch (readErr) {
        console.error(`Failed to read image ${targetFilename} from disk:`, readErr.message);
      }
    }

    for (const chatId of state.registeredChatIds) {
      try {
        await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        if (targetFilename) {
          const imagePath = path.join(state.DATA_DIR, 'photos', targetFilename);
          if (fs.existsSync(imagePath)) {
            const caption = `📸 Foto dari sensor *${sensor}* — ${new Date().toLocaleTimeString('id-ID')}`;
            const safeCaption = caption.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const cmd = `curl -s -X POST "https://api.telegram.org/bot${token}/sendPhoto" -F chat_id="${chatId}" -F photo="@${imagePath}" -F caption="${safeCaption}" -F parse_mode="Markdown"`;

            await new Promise((resolve, reject) => {
              require('child_process').exec(cmd, (error) => {
                if (error) return reject(error);
                resolve();
              });
            });
            console.log(`[Telegram] Foto berhasil diunggah via CURL ke chat ID: ${chatId}`);
          }
        }
        console.log(`Alert sent to chat ID: ${chatId}`);
      } catch (err) {
        console.error(`Failed to send alert to ${chatId}:`, err.message);
      }
    }
  })();

  if (!state.activePhotoUploads.has(sensor)) {
    state.activePhotoUploads.set(sensor, uploadPromise);
  }

  await uploadPromise;

  if (state.photoResolvers.has(sensor)) {
    const resolve = state.photoResolvers.get(sensor);
    resolve();
    state.photoResolvers.delete(sensor);
  }
  state.activePhotoUploads.delete(sensor);
}

async function sendMotionVideoAlert(location, sensor, videoFilePath) {
  if (state.activePhotoUploads.has(sensor)) {
    console.log(`[Telegram] Menahan upload video untuk sensor ${sensor} sampai foto selesai terkirim...`);
    await state.activePhotoUploads.get(sensor).catch(() => { });
    console.log(`[Telegram] Foto terkonfirmasi terkirim, melanjutkan upload video untuk ${sensor}.`);
  }

  console.log(`Attempting to send Telegram video alert for ${location} (${sensor})...`);
  if (state.registeredChatIds.length === 0) {
    console.log('No chat IDs registered for Telegram alerts.');
    return;
  }

  let fileStats;
  if (videoFilePath) {
    try {
      fileStats = fs.statSync(videoFilePath);
      if (fileStats.size < 1000) {
        console.error(`[Telegram] Video file ${videoFilePath} is too small (${fileStats.size} bytes), likely corrupted/empty.`);
        return;
      }
    } catch (readErr) {
      console.error(`Failed to stat video ${videoFilePath}:`, readErr.message);
      return;
    }
  }

  for (const chatId of state.registeredChatIds) {
    try {
      if (videoFilePath && fileStats) {
        const caption = `🎥 Rekaman 10 detik dari sensor *${sensor}* — ${new Date().toLocaleTimeString('id-ID')}`;
        console.log(`[Telegram] Uploading video via CURL to bypass Node.js stream bugs...`);

        const safeCaption = caption.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const cmd = `curl -s -X POST "https://api.telegram.org/bot${token}/sendVideo" -F chat_id="${chatId}" -F video="@${videoFilePath}" -F caption="${safeCaption}" -F parse_mode="Markdown"`;

        await new Promise((resolve, reject) => {
          require('child_process').exec(cmd, (error) => {
            if (error) return reject(error);
            resolve();
          });
        });
        console.log(`[Telegram] Video berhasil diunggah via CURL ke chat ID: ${chatId}`);
      }
    } catch (err) {
      console.error(`Failed to send video alert to ${chatId}:`, err.message);
    }
  }
}

function triggerTripwireAlert(location, sensor) {
  if (state.activeTripwireSpams.has(sensor)) return;

  console.log(`[Telegram] Memulai spam tripwire alert untuk ${sensor} di ${location}`);

  const intervalMs = 2000;
  const { Markup } = require('telegraf');

  const spState = { active: true, timer: null };
  state.activeTripwireSpams.set(sensor, spState);

  const loop = async () => {
    if (!spState.active) return;

    if (state.registeredChatIds.length > 0) {
      const message = `🚨 *PERINGATAN KRITIS: TRIPWIRE TERPUTUS!* 🚨\n\n📍 *Lokasi:* ${location}\n🛡️ *Sensor:* ${sensor}\n⚠️ *Indikasi:* Kabel terputus (Tegangan Drop <= 1.0V)\n⏰ *Waktu:* ${new Date().toLocaleTimeString('id-ID')} (WIB)`;

      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('🔕 Matikan Alert (Dismiss)', `dismiss_tw:${sensor}`)
      ]);

      for (const chatId of state.registeredChatIds) {
        if (!spState.active) {
          console.log(`[Telegram] Pengiriman dibatalkan di tengah antrian (dismissed).`);
          break;
        }

        try {
          await bot.telegram.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            ...keyboard
          });
        } catch (err) {
          console.error(`[Telegram] Gagal mengirim spam alert ke ${chatId}:`, err.message);
        }
      }
    }

    if (spState.active) {
      spState.timer = setTimeout(loop, intervalMs);
    }
  };

  loop();
}

module.exports = {
  sendMotionAlert,
  sendMotionVideoAlert,
  triggerTripwireAlert
};
