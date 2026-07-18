const fs = require('fs');
const path = require('path');
const state = require('./state');

const CONFIG_FILE = path.join(__dirname, '../../../data/servoConfig.json');
const SYSTEM_SETTINGS_FILE = path.join(__dirname, '../../../data/systemSettings.json');
const CAMERA_CONFIG_FILE = path.join(__dirname, '../../../data/cameraConfig.json');

function loadSystemSettings() {
  try {
    if (fs.existsSync(SYSTEM_SETTINGS_FILE)) {
      const data = fs.readFileSync(SYSTEM_SETTINGS_FILE, 'utf8');
      const settings = JSON.parse(data);
      state.globalAiEnabled = settings.globalAiEnabled !== undefined ? settings.globalAiEnabled : true;
      state.globalViewMode = settings.globalViewMode || 'single';
      state.globalPirAiDetection = settings.pirAiDetection !== undefined ? settings.pirAiDetection : true;
      state.globalPirAiRecording = settings.pirAiRecording !== undefined ? settings.pirAiRecording : true;
      state.globalStreamAiDetection = settings.streamAiDetection !== undefined ? settings.streamAiDetection : true;
      let rawStreamAiRecording = settings.streamAiRecording !== undefined ? settings.streamAiRecording : 'continuous';
      if (rawStreamAiRecording === true) rawStreamAiRecording = 'continuous';
      if (rawStreamAiRecording === false) rawStreamAiRecording = 'off';
      state.globalStreamAiRecording = rawStreamAiRecording;
      state.globalStreamAiTelegram = settings.streamAiTelegram !== undefined ? settings.streamAiTelegram : true;
      state.globalTelegramInterval = settings.telegramInterval !== undefined ? settings.telegramInterval : 10;
      state.globalObjectTracking = settings.objectTracking !== undefined ? settings.objectTracking : true;
      state.globalMaxDuration = settings.maxDuration !== undefined ? settings.maxDuration : 30;
      if (settings.systemConfig) {
        state.globalSystemConfig = { ...state.globalSystemConfig, ...settings.systemConfig };
      }
      console.log(`[Settings] Loaded system settings: ViewMode = ${state.globalViewMode}, AI = ${state.globalAiEnabled ? 'ENABLED' : 'DISABLED'}, PIR AI Det = ${state.globalPirAiDetection}, PIR AI Rec = ${state.globalPirAiRecording}, Stream AI Det = ${state.globalStreamAiDetection}, Stream AI Rec = ${state.globalStreamAiRecording}, Stream Telegram = ${state.globalStreamAiTelegram}, Telegram Interval = ${state.globalTelegramInterval}s, Tracking = ${state.globalObjectTracking}, MaxDur = ${state.globalMaxDuration}s`);
    } else {
      console.log('[Settings] No system settings file found, using defaults.');
    }
  } catch (err) {
    console.error('[Settings] Failed to load system settings:', err.message);
  }
}

function saveSystemSettings() {
  try {
    const parentDir = path.dirname(SYSTEM_SETTINGS_FILE);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    const settings = {
      globalAiEnabled: state.globalAiEnabled,
      globalViewMode: state.globalViewMode,
      pirAiDetection: state.globalPirAiDetection,
      pirAiRecording: state.globalPirAiRecording,
      streamAiDetection: state.globalStreamAiDetection,
      streamAiRecording: state.globalStreamAiRecording,
      streamAiTelegram: state.globalStreamAiTelegram,
      telegramInterval: state.globalTelegramInterval,
      objectTracking: state.globalObjectTracking,
      maxDuration: state.globalMaxDuration,
      systemConfig: state.globalSystemConfig
    };
    fs.writeFileSync(SYSTEM_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    console.log('[Settings] Saved system settings successfully.');
  } catch (err) {
    console.error('[Settings] Failed to save system settings:', err.message);
  }
}

function getEffectiveCameraConfig(config, device) {
  const scaleMode = config.scaleMode || 'static';
  const effectiveConfig = { ...config };

  if (scaleMode === 'dynamic') {
    const bars = device.signalBars || 5;
    const defaultRes = {
      5: 'UXGA',
      4: 'SVGA',
      3: 'VGA',
      2: 'QQVGA',
      1: '96X96'
    };
    const defaultQual = {
      5: 10,
      4: 12,
      3: 15,
      2: 20,
      1: 25
    };

    const dynResKey = `dynRes${bars}`;
    const dynQualKey = `dynQual${bars}`;

    effectiveConfig.resolution = config[dynResKey] || defaultRes[bars] || 'HVGA';
    effectiveConfig.quality = (config[dynQualKey] !== undefined) ? config[dynQualKey] : (defaultQual[bars] || 12);
  }

  return effectiveConfig;
}

function getReturnDuration(mac) {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const allConfigs = JSON.parse(fs.readFileSync(CONFIG_FILE));
      const config = allConfigs[mac];
      if (config && config.returnToDefaultDuration !== undefined) {
        return Number(config.returnToDefaultDuration) * 1000;
      }
    } catch (e) {
      console.error('Error reading return duration config:', e);
    }
  }
  return 15000; // Default fallback
}

function getDefaultAngle(mac) {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const allConfigs = JSON.parse(fs.readFileSync(CONFIG_FILE));
      const config = allConfigs[mac];
      if (config && config.defaultAngle !== undefined) {
        return Number(config.defaultAngle);
      }
    } catch (e) {
      console.error('Error reading default angle config:', e);
    }
  }
  return 90; // Default fallback
}

function getPirAngle(mac, sensor) {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const allConfigs = JSON.parse(fs.readFileSync(CONFIG_FILE));
      const config = allConfigs[mac];
      if (config) {
        if (sensor === 'left' && config.leftPirAngle !== undefined) return Number(config.leftPirAngle);
        if (sensor === 'middle' && config.middlePirAngle !== undefined) return Number(config.middlePirAngle);
        if (sensor === 'right' && config.rightPirAngle !== undefined) return Number(config.rightPirAngle);
        if (config.defaultAngle !== undefined) return Number(config.defaultAngle);
      }
    } catch (e) {
      console.error('Error reading pir angle config:', e);
    }
  }
  if (sensor === 'left') return 155;
  if (sensor === 'middle') return 90;
  if (sensor === 'right') return 0;
  return 90; // Default fallback
}

module.exports = {
  CONFIG_FILE,
  SYSTEM_SETTINGS_FILE,
  CAMERA_CONFIG_FILE,
  loadSystemSettings,
  saveSystemSettings,
  getEffectiveCameraConfig,
  getReturnDuration,
  getDefaultAngle,
  getPirAngle
};
