const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../../../data/config.json');
const DATA_DIR = path.join(__dirname, '../../../data');

let registeredChatIds = [];
const activePhotoUploads = new Map();
const activeTripwireSpams = new Map();
const pendingCaptures = [];
const photoResolvers = new Map();

// Load existing config
try {
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (Array.isArray(config.registeredChatIds)) {
      registeredChatIds = config.registeredChatIds;
    } else if (config.registeredChatId) {
      // Migrate from old format
      registeredChatIds = [config.registeredChatId];
    }
    console.log(`Loaded ${registeredChatIds.length} registered chat ID(s): ${registeredChatIds.join(', ')}`);
  }
} catch (err) {
  console.error('Failed to load config.json:', err);
}

function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify({ registeredChatIds }, null, 2));
  } catch (err) {
    console.error('Failed to save config.json:', err);
  }
}

module.exports = {
  configPath,
  DATA_DIR,
  registeredChatIds,
  activePhotoUploads,
  activeTripwireSpams,
  pendingCaptures,
  photoResolvers,
  saveConfig
};
