const fs = require('fs');
const path = require('path');
const state = require('./state');
const { getDefaultAngle } = require('./configManager');
const { updateDeviceServoAngle } = require('./deviceManager');
const { getDeviceHeader, getActiveAiClient, stopAiRecording } = require('./aiWorker');
const { aiClient } = require('../services/aiClient');
const { updateLatestLogWithAI, getLogs } = require('../services/sqllite_logger');
const { sendMotionAlert } = require('../telegram');
const { resetIdleTimer } = require('./sweepManager');

async function handlePirTrigger(ip, sensor, wss) {
  const deviceId = `cam_${ip.replace(/\./g, '_')}`;
  const device = state.devices.get(deviceId);

  if (!device) {
    console.warn(`[PIR Trigger] No device found for IP: ${ip}. Skipping.`);
    return;
  }
  
  resetIdleTimer(deviceId); // Reset Idle Sweep Timer on PIR detection

  // Use the latest stream frame already buffered by aiWorker.
  // If no frame is available yet (e.g. right after boot or UDP failures),
  // wait up to 2 seconds for the next stream frame to arrive.
  let imageBuffer = device.latestFrame;
  if (!imageBuffer || imageBuffer.length === 0) {
    const maxRetries = 10;
    const retryIntervalMs = 200;
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
      imageBuffer = device.latestFrame;
      if (imageBuffer && imageBuffer.length > 0) {
        console.log(`[PIR Trigger] Frame became available after ${(i + 1) * retryIntervalMs}ms wait for device ${deviceId}.`);
        break;
      }
    }
  }
  if (!imageBuffer || imageBuffer.length === 0) {
    console.warn(`[PIR Trigger] No latest frame available for device ${deviceId} after 2s wait. Skipping snapshot.`);
    return;
  }

  // Build filepath/filename from the sensor and IP
  const timestamp = Date.now();
  const filename = `motion_${ip.replace(/\./g, '_')}_${sensor}_${timestamp}.jpg`;
  const photosDir = path.join(__dirname, '../../../data/photos');
  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
  }
  const filepath = path.join(photosDir, filename);
  const imageUrl = `/data/photos/${filename}`;

  // --- 1. Determine whether AI can drive the recording ---
  const { shouldRunPirSnapshotAI } = require('../services/aiController');
  const isAiOnline = aiClient.isConnected && state.globalAiEnabled && state.globalPirAiRecording;
  const aiSettings = {
    globalAiEnabled: state.globalAiEnabled,
    globalPirAiDetection: state.globalPirAiDetection,
    globalPirAiRecording: state.globalPirAiRecording
  };

  // --- 2. Evaluate Telegram cooldown ---
  const now = Date.now();
  const intervalMs = state.globalTelegramInterval * 1000;
  if (!device.lastTelegramAlertTime || (now - device.lastTelegramAlertTime >= intervalMs)) {
    device.lastTelegramAlertTime = now;
    device.telegramAlertsMuted = false;
  } else {
    console.log(`[Telegram] PIR alerts throttled (cooldown active) for device ${deviceId}`);
    device.telegramAlertsMuted = true;
  }

  // --- 3. Start recording session ---
  if (state.globalSystemConfig.pirRecordVideo) {
    device.isRecordingAi = true;
    device.aiSensorName = sensor;
    device.lastTimePersonSeen = Date.now();

    // Trim rollingBuffer to keep only the pre-roll frames of the sweep movement
    while (device.rollingBuffer.length > 30) {
      device.rollingBuffer.shift();
    }

    console.log(`[PIR Video] Start recording video stream for ${deviceId} after PIR snapshot.`);

    // Tell camera to cancel its local return-to-center timer
    if (device.ws && device.ws.readyState === 1) {
      device.ws.send(JSON.stringify({ type: 'cancel_return' }));
      console.log(`[PIR Video] Sent cancel_return command to camera ${deviceId}`);
    }
  } else {
    console.log(`[PIR Video] Video recording disabled by system config. Skipping recording start.`);
  }

  // --- 4. Schedule recording stop timeout / return servo ---
  if (state.globalSystemConfig.pirRecordVideo) {
    const recordingDuration = (state.globalSystemConfig.pirRecordDuration || 10) * 1000;
    if (!isAiOnline) {
      console.log(`[PIR Video] AI is offline/disabled. Scheduling flat ${recordingDuration / 1000}s stop & return for ${deviceId}.`);
      device.pirActiveTimeout = setTimeout(() => {
        if (device.isRecordingAi) stopAiRecording(deviceId);
        device.pirActiveTimeout = null;
      }, recordingDuration);
    } else {
      console.log(`[PIR Video] AI is online. Scheduling 90-second safety fallback timeout for ${deviceId}.`);
      device.pirActiveTimeout = setTimeout(() => {
        if (device.isRecordingAi) stopAiRecording(deviceId);
        device.pirActiveTimeout = null;
      }, 90000);
    }
  } else {
    // If not recording video, return the servo to default angle after a short delay to allow snapshot visualization
    console.log(`[PIR Servo] Scheduling return-to-center in 2 seconds for ${deviceId} (no video recording).`);
    device.pirActiveTimeout = setTimeout(() => {
      device.isPirActive = false;
      const defaultAngle = getDefaultAngle(device.mac);
      updateDeviceServoAngle(deviceId, defaultAngle);
      device.pirActiveTimeout = null;
    }, 2000);
  }

  // --- 5. Run Telegram alert and AI snapshot analysis asynchronously ---
  (async () => {
    // Yield to event loop to ensure logEvent() in websocket.js has executed and written the log first
    await new Promise(resolve => setImmediate(resolve));

    // Save raw frame immediately for instant Telegram alert and UI display
    fs.writeFileSync(filepath, imageBuffer);

    // Send Telegram alert instantly with the raw photo
    let telegramPromise = Promise.resolve();
    if (!device.telegramAlertsMuted && state.globalSystemConfig.telegramAlertPir) {
      telegramPromise = sendMotionAlert(`IP: ${ip}`, sensor, filename);
    } else {
      console.log(`[Telegram] PIR snapshot alert skipped/throttled for device ${deviceId} (Muted: ${device.telegramAlertsMuted}, Enabled: ${state.globalSystemConfig.telegramAlertPir})`);
    }

    let imageToSave = imageBuffer;
    let humanPresence = false;
    let aiDetails = null;

    if (shouldRunPirSnapshotAI(aiSettings)) {
      try {
        let result;
        // Always use YOLO (forVerification = true) for single snapshots to detect persons reliably
        const activeClient = getActiveAiClient(true);
        const extraHeader = getDeviceHeader(deviceId);
        result = await activeClient.sendRequest(imageBuffer, { annotate: true, forceYolo: true }, 10000, extraHeader);

        if (result) {
          aiDetails = {
            status: result.status,
            message: result.pesan,
            person_detected: result.ada_orang,
            person_count: result.jumlah_orang,
            box_coordinates: result.koordinat_kotak
          };
          humanPresence = result.ada_orang === true;

          if (result.annotated_image) {
            imageToSave = Buffer.from(result.annotated_image, 'base64');
            // Overwrite the raw image with the annotated version
            fs.writeFileSync(filepath, imageToSave);
          }

          console.log(`[AI Object Detection] Result: ${result.pesan} (Human count: ${result.jumlah_orang})`);

          // Broadcast bounding boxes to frontend immediately
          if (result.koordinat_kotak && Array.isArray(result.koordinat_kotak)) {
            const boxPayload = JSON.stringify({
              type: 'stream_boxes',
              deviceId: deviceId,
              boxes: result.koordinat_kotak
            });
            state.broadcastToKiosks(boxPayload);

            // Clear temporary PIR event boxes after 4 seconds
            setTimeout(() => {
              const clearPayload = JSON.stringify({
                type: 'stream_boxes',
                deviceId: deviceId,
                boxes: []
              });
              state.broadcastToKiosks(clearPayload);
            }, 4000);
          }
        }
      } catch (aiErr) {
        console.error('[AI Object Detection] Failed to call AI (falling back to raw image):', aiErr.message);
      }
    } else {
      console.log(`[AI Object Detection] PIR AI is disabled. Skipping AI analysis for IP: ${ip}.`);
    }

    // Update log.json
    await updateLatestLogWithAI(sensor, ip, imageUrl, humanPresence, aiDetails);

    // Notify kiosk clients
    const motionPayload = JSON.stringify({
      type: 'motion_image_update',
      sensor: sensor,
      deviceId: deviceId,
      imageUrl: imageUrl,
      humanPresence: humanPresence,
      aiDetails: aiDetails
    });

    const payloadLogs = JSON.stringify({
      type: 'historical_logs',
      logs: getLogs()
    });

    state.broadcastToKiosks(motionPayload);
    state.broadcastToKiosks(payloadLogs);

    // Await Telegram notification completion
    await telegramPromise;
  })().catch(err => {
    console.error('[PIR Trigger] Asynchronous processing error:', err);
  });
}

module.exports = {
  handlePirTrigger
};
