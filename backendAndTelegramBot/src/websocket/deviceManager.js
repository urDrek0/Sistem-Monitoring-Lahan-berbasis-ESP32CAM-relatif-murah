const fs = require('fs');
const state = require('./state');
const { CAMERA_CONFIG_FILE, getEffectiveCameraConfig } = require('./configManager');

function getSignalBars(rssi) {
  if (rssi === null || rssi === undefined || isNaN(rssi)) return 0;
  const absRssi = Math.abs(rssi);
  if (absRssi < 30) return 5;
  if (absRssi < 40) return 4;
  if (absRssi < 50) return 3;
  if (absRssi < 60) return 2;
  return 1;
}

function serializeFrame(deviceId, frameBuffer) {
  const deviceIdBuffer = Buffer.from(deviceId, 'utf8');
  const header = Buffer.alloc(1 + deviceIdBuffer.length);
  header.writeUInt8(deviceIdBuffer.length, 0);
  deviceIdBuffer.copy(header, 1);
  return Buffer.concat([header, frameBuffer]);
}

function updateDeviceServoAngle(deviceId, angle, skipCameraSend = false) {
  const device = state.devices.get(deviceId);
  if (!device) return;

  device.currentAngle = angle;
  if (!skipCameraSend && device.ws && device.ws.readyState === 1) {
    device.ws.send(JSON.stringify({ type: 'servo_control', value: angle }));
  }

  const payload = JSON.stringify({
    type: 'servo_angle_update',
    deviceId: deviceId,
    value: angle
  });

  state.broadcastToKiosks(payload);
}

function updateDeviceSweepState(deviceId, sweepActive, skipCameraSend = false) {
  const device = state.devices.get(deviceId);
  if (!device) return;

  device.sweepActive = sweepActive;
  if (!skipCameraSend && device.ws && device.ws.readyState === 1) {
    device.ws.send(JSON.stringify({ type: 'sweep_control', value: sweepActive }));
  }

  const payload = JSON.stringify({
    type: 'sweep_status_update',
    deviceId: deviceId,
    value: sweepActive
  });

  state.broadcastToKiosks(payload);
}

function broadcastDeviceList() {
  const deviceList = Array.from(state.devices.values()).map(device => ({
    id: device.id,
    status: device.status,
    ip: device.ip,
    mac: device.mac,
    signalBars: device.signalBars,
    signalRssi: device.signalRssi || null,
    lastSeen: device.lastSeen,
    currentAngle: device.currentAngle,
    sweepActive: device.sweepActive || 'off'
  }));

  const payload = JSON.stringify({ type: 'device_list', devices: deviceList });
  state.broadcastToKiosks(payload);
}

function switchActiveStream(direction) {
  const deviceList = Array.from(state.devices.values());
  if (deviceList.length <= 1) return state.globalActiveDeviceId;

  let currentIndex = deviceList.findIndex(d => d.id === state.globalActiveDeviceId);
  if (currentIndex === -1) currentIndex = 0;

  let nextIndex;
  if (direction === 'right') {
    nextIndex = (currentIndex + 1) % deviceList.length;
  } else {
    nextIndex = (currentIndex - 1 + deviceList.length) % deviceList.length;
  }

  state.globalActiveDeviceId = deviceList[nextIndex].id;
  console.log(`[SwitchActiveStream] Changed active stream to: ${state.globalActiveDeviceId} (direction: ${direction})`);

  const activeStreamPayload = JSON.stringify({ type: 'active_stream_updated', deviceId: state.globalActiveDeviceId });
  state.broadcastToKiosks(activeStreamPayload);

  return state.globalActiveDeviceId;
}

function updateFlashIntensity(intensity) {
  let allConfigs = {};
  if (fs.existsSync(CAMERA_CONFIG_FILE)) {
    try {
      const rawData = fs.readFileSync(CAMERA_CONFIG_FILE);
      allConfigs = JSON.parse(rawData);
    } catch (e) { }
  }

  // Ensure currently connected cameras are in allConfigs
  const deviceArray = Array.from(state.devices.values());
  deviceArray.forEach(cameraDevice => {
    if (cameraDevice.type === 'Camera' && cameraDevice.mac) {
      if (!allConfigs[cameraDevice.mac]) {
        allConfigs[cameraDevice.mac] = {};
      }
    }
  });

  // Update intensity for all known cameras
  Object.keys(allConfigs).forEach(mac => {
    allConfigs[mac] = { ...allConfigs[mac], flashIntensity: intensity, lastUpdated: new Date().toISOString() };
  });

  fs.writeFileSync(CAMERA_CONFIG_FILE, JSON.stringify(allConfigs, null, 2));

  // Push updated config directly to the specific camera device via WebSocket
  deviceArray.forEach(cameraDevice => {
    if (cameraDevice.ws && cameraDevice.ws.readyState === 1 && cameraDevice.type === 'Camera') {
      const deviceConfig = allConfigs[cameraDevice.mac];
      if (deviceConfig) {
        const configToSend = getEffectiveCameraConfig(deviceConfig, cameraDevice);
        cameraDevice.ws.send(JSON.stringify({ type: 'camera_config_update', config: configToSend }));
        cameraDevice.currentResolution = configToSend.resolution;
        cameraDevice.currentQuality = configToSend.quality;
      }
    }
  });
  console.log(`[FlashControl] Pushed updated flash intensity (${intensity}) to all cameras`);
}

function sendCaptureRequest(deviceId) {
  const device = state.devices.get(deviceId);
  if (!device || !device.ws || device.ws.readyState !== 1) {
    console.log(`sendCaptureRequest: device ${deviceId} not available`);
    return false;
  }
  device.ws.send(JSON.stringify({ type: 'capture_request' }));
  console.log(`Capture request sent to ${deviceId}`);
  return true;
}

module.exports = {
  getSignalBars,
  serializeFrame,
  updateDeviceServoAngle,
  broadcastDeviceList,
  switchActiveStream,
  updateFlashIntensity,
  sendCaptureRequest,
  updateDeviceSweepState
};
