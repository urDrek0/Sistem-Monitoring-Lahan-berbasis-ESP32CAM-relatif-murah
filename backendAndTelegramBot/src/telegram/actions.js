const path = require('path');
const fs = require('fs');
const state = require('./state');
const { requestCapture } = require('./captureQueue');

function registerActions(bot) {
  bot.action(/^gi:(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const filename = ctx.match[1];
      const filePath = path.join(state.DATA_DIR, 'photos', filename);

      if (!fs.existsSync(filePath)) {
        return ctx.reply(`❌ File tidak ditemukan di server: \`${filename}\``, { parse_mode: 'Markdown' });
      }

      const parts = filename.replace('.jpg', '').split('_');
      const timestampMs = parseInt(parts[parts.length - 1]);
      const timeStr = isNaN(timestampMs)
        ? 'Tidak diketahui'
        : new Date(timestampMs).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

      const caption = `🖼️ *${filename}*\n🕐 ${timeStr} (WIB)`;
      const safeCaption = caption.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = ctx.chat.id;
      const cmd = `curl -s -X POST "https://api.telegram.org/bot${token}/sendPhoto" -F chat_id="${chatId}" -F photo="@${filePath}" -F caption="${safeCaption}" -F parse_mode="Markdown"`;

      await new Promise((resolve, reject) => {
        require('child_process').exec(cmd, (error) => {
          if (error) return reject(error);
          resolve();
        });
      });
    } catch (err) {
      console.error('Error in getimage callback:', err);
      await ctx.reply('❌ Gagal mengirim gambar. Coba lagi nanti.');
    }
  });

  bot.action(/^gv:(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const timestampPart = ctx.match[1];

      const { getLogs } = require('../services/sqllite_logger');
      const logs = getLogs();
      const entry = logs.find(e => e.videoUrl && e.videoUrl.includes(`_${timestampPart}.mp4`));

      if (!entry) {
        return ctx.reply('❌ Catatan video tidak ditemukan di log.');
      }

      const filename = entry.videoUrl.split('/').pop();
      const filePath = path.join(state.DATA_DIR, 'videos', filename);

      if (!fs.existsSync(filePath)) {
        return ctx.reply(`❌ File tidak ditemukan di server: \`${filename}\``, { parse_mode: 'Markdown' });
      }

      const parts = filename.replace('.mp4', '').split('_');
      const timestampMs = parseInt(parts[parts.length - 1]);
      const timeStr = isNaN(timestampMs)
        ? 'Tidak diketahui'
        : new Date(timestampMs).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

      const caption = `🎥 *${filename}*\n🕐 ${timeStr} (WIB)`;
      const safeCaption = caption.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = ctx.chat.id;
      const cmd = `curl -s -X POST "https://api.telegram.org/bot${token}/sendVideo" -F chat_id="${chatId}" -F video="@${filePath}" -F caption="${safeCaption}" -F parse_mode="Markdown"`;

      await new Promise((resolve, reject) => {
        require('child_process').exec(cmd, (error) => {
          if (error) return reject(error);
          resolve();
        });
      });
    } catch (err) {
      console.error('Error in getvideo callback:', err);
      await ctx.reply('❌ Gagal mengirim video. Coba lagi nanti.');
    }
  });

  bot.action(/^cap:(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery('📸 Mengirim perintah ke kamera...');
      const deviceId = ctx.match[1];
      const { Markup } = require('telegraf');
      const reqId = Date.now().toString();
      const waitingMsg = await ctx.reply('📸 Mengirim perintah capture... harap tunggu (~5-15 detik).', {
        ...Markup.inlineKeyboard([Markup.button.callback('❌ Batalkan', `cancel_cap:${reqId}`)])
      });

      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => { });
      await requestCapture(ctx, deviceId, reqId, waitingMsg.message_id);
    } catch (err) {
      console.error('Error in capture callback:', err);
      await ctx.reply('❌ Gagal melakukan capture.');
    }
  });

  bot.action(/^cancel_cap:(.+)$/, async (ctx) => {
    try {
      const reqId = ctx.match[1];
      const idx = state.pendingCaptures.findIndex(p => p.id === reqId);

      if (idx !== -1) {
        const { reject, timer } = state.pendingCaptures[idx];
        clearTimeout(timer);
        state.pendingCaptures.splice(idx, 1);
        reject(new Error('cancelled'));

        await ctx.editMessageText('❌ Capture dibatalkan oleh user.').catch(() => { });
        await ctx.answerCbQuery('Dibatalkan');
      } else {
        await ctx.answerCbQuery('Proses sudah selesai atau kadaluarsa', { show_alert: true });
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => { });
      }
    } catch (err) {
      console.error('Error cancelling capture:', err);
    }
  });

  bot.action(/^dismiss_tw:(.+)$/, async (ctx) => {
    try {
      const sensorId = ctx.match[1];

      if (state.activeTripwireSpams.has(sensorId)) {
        const spState = state.activeTripwireSpams.get(sensorId);
        spState.active = false;
        clearTimeout(spState.timer);
        state.activeTripwireSpams.delete(sensorId);

        await ctx.answerCbQuery('✅ Alert berhasil dimatikan.', { show_alert: true });

        const newText = ctx.callbackQuery.message.text + `\n\n✅ *DIMATIKAN* oleh user/ID: ${ctx.from.id}`;
        await ctx.editMessageText(newText, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [] }
        }).catch(() => { });
      } else {
        await ctx.answerCbQuery('ℹ️ Alert ini sudah dimatikan sebelumnya.');
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => { });
      }
    } catch (err) {
      console.error('Error in dismiss_tw callback:', err);
      await ctx.answerCbQuery('❌ Gagal memproses.');
    }
  });
}

module.exports = {
  registerActions
};
