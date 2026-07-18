const { Telegraf } = require('telegraf');
const https = require('https');
const state = require('./state');

// Force IPv4 to prevent 'socket hang up' from broken ISP IPv6 routing
const agent = new https.Agent({ family: 4 });
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
  telegram: { agent }
});

// Middleware: Authentication gates for private bot usage
bot.use(async (ctx, next) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return next();

  if (state.registeredChatIds.includes(chatId)) {
    return next();
  }

  const text = ctx.message?.text;
  const authPassword = process.env.TELEGRAM_AUTH_PASSWORD;

  if (authPassword && text === authPassword) {
    state.registeredChatIds.push(chatId);
    state.saveConfig();
    await ctx.reply(`✅ Autentikasi Berhasil! \nID Anda (${chatId}) telah didaftarkan. Anda sekarang akan menerima notifikasi motion alerts.`);
    return;
  }

  return ctx.reply('🔐 *Akses Terbatas*\n\nBot ini bersifat privat. Silakan masukkan password registrasi untuk melanjutkan.', { parse_mode: 'Markdown' });
});

module.exports = bot;
