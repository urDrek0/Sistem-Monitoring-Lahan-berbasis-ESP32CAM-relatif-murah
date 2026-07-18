const bot = require('./bot');
const { registerCommands } = require('./commands');
const { registerActions } = require('./actions');
const { notifyCaptureResult, registerExpectedPhoto } = require('./captureQueue');
const { sendMotionAlert, sendMotionVideoAlert, triggerTripwireAlert } = require('./alerts');

registerCommands(bot);
registerActions(bot);

function initTelegramBot() {
  bot.launch().then(() => {
    console.log('Telegram bot started');
  }).catch((err) => {
    console.error('Failed to start Telegram bot:', err);
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

module.exports = {
  initTelegramBot,
  sendMotionAlert,
  sendMotionVideoAlert,
  notifyCaptureResult,
  registerExpectedPhoto,
  triggerTripwireAlert
};
