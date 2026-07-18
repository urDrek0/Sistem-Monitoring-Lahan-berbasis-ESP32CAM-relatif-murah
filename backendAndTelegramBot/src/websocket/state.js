const devices = new Map();

const state = {
  devices,
  globalActiveDeviceId: null,
  wssInstance: null,
  globalAiEnabled: true,
  globalViewMode: 'single',
  globalPirAiDetection: true,
  globalPirAiRecording: true,
  globalStreamAiDetection: true,
  globalStreamAiRecording: 'continuous',
  globalStreamAiTelegram: true,
  globalTelegramInterval: 10,
  globalObjectTracking: true,
  globalMaxDuration: 30,
  globalSystemConfig: {
    pirEnabled: true,
    pirCooldown: 30,
    pirRecordVideo: true,
    pirRecordDuration: 10,
    telegramAlertPir: true,
    telegramAlertAi: true,
    telegramAlertMotion: false,
    cameraDetectionMode: 'AI',
    streamAiDetection: true,
    streamAiCaptureEnabled: true,
    objectTracking: true,
    pixelMotionSensitivity: 20,
    pixelMotionMode: 0,
    pixelMotionMerge: false,
    pixelMotionResetInterval: 1,
    pixelMotionClusterDist: 50,
    pixelMotionMinSize: 10,
    pixelMotionCaptureEnabled: true,
    pixelMotionRecordingEnabled: true,
    pixelMotionCaptureDelay: 100,
    webSoundEnabled: true,
    showFpsMeter: true,
    udpStreamEnabled: false
  },

  // Broadcast payload to all Kiosk clients (clients that are not camera devices)
  broadcastToKiosks(payload) {
    if (!state.wssInstance) return;
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    state.wssInstance.clients.forEach(client => {
      if (client.readyState === 1 && (!client.path || !client.path.startsWith('/camera'))) {
        client.send(data);
      }
    });
  },

  // Broadcast payload to all connected Camera clients
  broadcastToCameras(payload) {
    if (!state.wssInstance) return;
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    state.wssInstance.clients.forEach(client => {
      if (client.readyState === 1 && client.path && client.path.startsWith('/camera')) {
        client.send(data);
      }
    });
  }
};

module.exports = state;
