const path = require('path');
const fs = require('fs');
const state = require('./state');
const { requestCapture } = require('./captureQueue');

function getLatestImageFilename() {
  try {
    const photosDir = path.join(state.DATA_DIR, 'photos');
    if (!fs.existsSync(photosDir)) return null;

    const files = fs.readdirSync(photosDir)
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
      .map(f => ({
        name: f,
        mtime: fs.statSync(path.join(photosDir, f)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime);

    return files.length > 0 ? files[0].name : null;
  } catch (err) {
    console.error('Error reading /data/photos directory:', err);
    return null;
  }
}

function registerCommands(bot) {
  bot.start((ctx) => {
    const welcomeMessage = `
Welcome to Gateway_OS Bot! 🛡️
Your surveillance gateway is online and ready.

Available Commands:
/start - Tampilkan pesan sambutan ini
/register <password> - Mendaftarkan ID Anda agar menerima notifikasi
/listids - Lihat daftar ID yang sudah terdaftar
/deleteid <id> - Hapus ID dari daftar penerima notifikasi
/devices - Lihat daftar kamera ESP32 yang terhubung
/capture - Minta kamera mengambil foto secara manual saat ini juga
/flash <0-255> - Atur kecerahan lampu sorot/flash (0 mati, 255 maksimal)
/getimage DD MM YY - Ambil foto histori berdasarkan tanggal
/getvideo DD MM YY - Ambil video histori berdasarkan tanggal
    `;
    ctx.reply(welcomeMessage);
  });

  bot.command('listids', (ctx) => {
    const chatId = ctx.chat.id;
    if (!state.registeredChatIds.includes(chatId)) {
      return ctx.reply('❌ Anda tidak memiliki izin untuk melihat daftar ID. Silakan daftar terlebih dahulu.');
    }

    if (state.registeredChatIds.length === 0) {
      return ctx.reply('ℹ️ Belum ada ID yang terdaftar.');
    }

    const list = state.registeredChatIds.map((id, index) => `${index + 1}. \`${id}\``).join('\n');
    ctx.reply(`📋 *Daftar ID Terdaftar:* \n\n${list}`, { parse_mode: 'Markdown' });
  });

  bot.command('deleteid', (ctx) => {
    const chatId = ctx.chat.id;
    if (!state.registeredChatIds.includes(chatId)) {
      return ctx.reply('❌ Anda tidak memiliki izin untuk menghapus ID.');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('⚠️ Gunakan format: /deleteid <chat_id>');
    }

    const targetId = parseInt(args[1]);
    const index = state.registeredChatIds.indexOf(targetId);

    if (index === -1) {
      return ctx.reply(`❌ ID \`${targetId}\` tidak ditemukan dalam daftar.`, { parse_mode: 'Markdown' });
    }

    state.registeredChatIds.splice(index, 1);
    state.saveConfig();
    ctx.reply(`✅ ID \`${targetId}\` berhasil dihapus.\nTotal penerima sekarang: ${state.registeredChatIds.length} akun.`, { parse_mode: 'Markdown' });
  });

  bot.command('devices', async (ctx) => {
    try {
      const { getDevices } = require('../websocket');
      const devices = getDevices();

      if (devices.size === 0) {
        return ctx.reply('📷 Tidak ada perangkat kamera yang terhubung saat ini.');
      }

      const lines = Array.from(devices.values()).map(device => {
        const statusEmoji = device.status === 'Online' ? '🟢' : '🔴';
        const signal = device.signalBars !== undefined ? ` | 📶 ${device.signalBars}/5` : '';
        return `${statusEmoji} *${device.ip}*\n   Status: ${device.status}${signal}\n   Terakhir aktif: ${device.lastSeen}`;
      });

      const message = `📷 *Perangkat Terdaftar: ${devices.size}*\n\n${lines.join('\n\n')}`;
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Error in /devices command:', err);
      await ctx.reply('❌ Gagal mengambil daftar perangkat.');
    }
  });

  bot.command('capture', async (ctx) => {
    try {
      const { getDevices } = require('../websocket');
      const devices = getDevices();
      const onlineDevices = Array.from(devices.values()).filter(d => d.status === 'Online');

      if (onlineDevices.length === 0) {
        return ctx.reply('📷 Tidak ada kamera yang online saat ini.\nPastikan ESP32-CAM terhubung ke jaringan.');
      }

      const { Markup } = require('telegraf');
      if (onlineDevices.length === 1) {
        const reqId = Date.now().toString();
        const waitingMsg = await ctx.reply('📸 Mengirim perintah capture ke kamera... harap tunggu (~5-15 detik).', {
          ...Markup.inlineKeyboard([Markup.button.callback('❌ Batalkan', `cancel_cap:${reqId}`)])
        });
        await requestCapture(ctx, onlineDevices[0].id, reqId, waitingMsg.message_id);
      } else {
        const buttons = onlineDevices.map(d =>
          [Markup.button.callback(`📷 ${d.name || 'Camera'} (${d.ip})`, `cap:${d.id}`)]
        );
        await ctx.reply(
          `📷 *Pilih kamera untuk capture:*\n${onlineDevices.length} kamera online tersedia.`,
          { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
        );
      }
    } catch (err) {
      console.error('Error in /capture command:', err);
      await ctx.reply('❌ Gagal mengirim perintah capture.');
    }
  });

  bot.command('flash', async (ctx) => {
    const chatId = ctx.chat.id;
    if (!state.registeredChatIds.includes(chatId)) {
      return ctx.reply('❌ Anda tidak terdaftar. Gunakan /register <password>');
    }

    const message = ctx.message.text.trim();
    const parts = message.split(' ');

    if (parts.length < 2) {
      return ctx.reply('ℹ️ Format salah. Gunakan: `/flash <0-255>`\nContoh: `/flash 50` untuk cahaya redup, `/flash 255` untuk maksimal.', { parse_mode: 'Markdown' });
    }

    const intensity = parseInt(parts[1]);

    if (isNaN(intensity) || intensity < 0 || intensity > 255) {
      return ctx.reply('❌ Nilai intensitas harus berupa angka antara 0 hingga 255.');
    }

    try {
      const { updateFlashIntensity } = require('../websocket');
      updateFlashIntensity(intensity);
      await ctx.reply(`✅ Intensitas flash berhasil diubah menjadi **${intensity}** untuk semua kamera.`, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[Telegram] Failed to update flash:', err);
      await ctx.reply(`❌ Terjadi kesalahan saat mengubah flash: ${err.message}`);
    }
  });

  bot.command('getimage', async (ctx) => {
    try {
      const args = ctx.message.text.trim().split(/\s+/).slice(1);
      if (args.length !== 3) {
        return ctx.reply('⚠️ Format salah.\n\nGunakan: /getimage DD MM YY\nContoh: /getimage 16 05 26');
      }

      const [dd, mm, yy] = args.map(Number);
      if ([dd, mm, yy].some(isNaN) || dd < 1 || dd > 31 || mm < 1 || mm > 12) {
        return ctx.reply('❌ Tanggal tidak valid. Pastikan format: /getimage DD MM YY\nContoh: /getimage 16 05 26');
      }

      const fullYear = yy < 100 ? yy + 2000 : yy;
      const dateLabel = `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${fullYear}`;

      const { getLogs } = require('../services/sqllite_logger');
      const logs = getLogs();

      const matched = logs.filter(entry => {
        if (!entry.imageUrl) return false;
        const d = new Date(entry.timestamp);
        const localTimeMs = d.getTime() + (7 * 60 * 60 * 1000);
        const localDate = new Date(localTimeMs);

        return (
          localDate.getUTCDate() === dd &&
          localDate.getUTCMonth() + 1 === mm &&
          localDate.getUTCFullYear() === fullYear
        );
      });

      if (matched.length === 0) {
        return ctx.reply(`📂 Tidak ada data gambar pada tanggal *${dateLabel}*.\n\nCek tanggal lain atau pastikan kamera sudah mengirim foto.`, { parse_mode: 'Markdown' });
      }

      const MAX_BUTTONS = 10;
      const displayed = matched.slice(0, MAX_BUTTONS);
      const remaining = matched.length - MAX_BUTTONS;

      const { Markup } = require('telegraf');
      const buttons = displayed.map((entry) => {
        const d = new Date(entry.timestamp);
        const timeStr = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta' });
        const label = `${timeStr} · ${entry.sensor}`;
        const filename = entry.imageUrl.split('/').pop();
        return Markup.button.callback(label, `gi:${filename}`);
      });

      const keyboard = [];
      for (let i = 0; i < buttons.length; i += 2) {
        keyboard.push(buttons.slice(i, i + 2));
      }

      let caption = `🗂️ *Data gambar pada ${dateLabel}*\nDitemukan *${matched.length}* event dengan foto.\n\nPilih event untuk melihat gambarnya:`;
      if (remaining > 0) {
        caption += `\n\n_(Menampilkan 10 terbaru. ${remaining} lainnya tidak ditampilkan)_`;
      }

      await ctx.reply(caption, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(keyboard)
      });
    } catch (err) {
      console.error('Error in /getimage command:', err);
      await ctx.reply('❌ Gagal memproses perintah. Coba lagi nanti.');
    }
  });

  bot.command('getvideo', async (ctx) => {
    try {
      const args = ctx.message.text.trim().split(/\s+/).slice(1);
      if (args.length !== 3) {
        return ctx.reply('⚠️ Format salah.\n\nGunakan: /getvideo DD MM YY\nContoh: /getvideo 04 06 26');
      }

      const [dd, mm, yy] = args.map(Number);
      if ([dd, mm, yy].some(isNaN) || dd < 1 || dd > 31 || mm < 1 || mm > 12) {
        return ctx.reply('❌ Tanggal tidak valid. Pastikan format: /getvideo DD MM YY\nContoh: /getvideo 16 05 26');
      }

      const fullYear = yy < 100 ? yy + 2000 : yy;
      const dateLabel = `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${fullYear}`;

      const { getLogs } = require('../services/sqllite_logger');
      const logs = getLogs();

      const matched = logs.filter(entry => {
        if (!entry.videoUrl) return false;
        const d = new Date(entry.timestamp);
        const localTimeMs = d.getTime() + (7 * 60 * 60 * 1000);
        const localDate = new Date(localTimeMs);

        return (
          localDate.getUTCDate() === dd &&
          localDate.getUTCMonth() + 1 === mm &&
          localDate.getUTCFullYear() === fullYear
        );
      });

      if (matched.length === 0) {
        return ctx.reply(`📂 Tidak ada data video pada tanggal *${dateLabel}*.\n\nCek tanggal lain atau pastikan kamera sudah merekam video.`, { parse_mode: 'Markdown' });
      }

      const MAX_BUTTONS = 10;
      const displayed = matched.slice(0, MAX_BUTTONS);
      const remaining = matched.length - MAX_BUTTONS;

      const { Markup } = require('telegraf');
      const buttons = displayed.map((entry) => {
        const d = new Date(entry.timestamp);
        const timeStr = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta' });
        const label = `${timeStr} · ${entry.sensor}`;
        const filename = entry.videoUrl.split('/').pop();
        const timestampPart = filename.replace('.mp4', '').split('_').pop();
        return Markup.button.callback(label, `gv:${timestampPart}`);
      });

      const keyboard = [];
      for (let i = 0; i < buttons.length; i += 2) {
        keyboard.push(buttons.slice(i, i + 2));
      }

      let caption = `🗂️ *Data video pada ${dateLabel}*\nDitemukan *${matched.length}* event dengan video.\n\nPilih event untuk melihat videonya:`;
      if (remaining > 0) {
        caption += `\n\n_(Menampilkan 10 terbaru. ${remaining} lainnya tidak ditampilkan)_`;
      }

      await ctx.reply(caption, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(keyboard)
      });
    } catch (err) {
      console.error('Error in /getvideo command:', err);
      await ctx.reply('❌ Gagal memproses perintah. Coba lagi nanti.');
    }
  });
}

module.exports = {
  registerCommands,
  getLatestImageFilename
};
