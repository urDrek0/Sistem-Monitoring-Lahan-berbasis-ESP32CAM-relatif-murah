/**
 * aiController.js
 *
 * Centralized AI detection gatekeeper.
 * All decisions about when to run AI analysis flow through here,
 * so individual modules (websocket, routes) stay clean and consistent.
 */

/**
 * Determines whether live stream frames should be enqueued for AI analysis.
 *
 * Returns true when:
 *  - Global AI is enabled AND stream AI detection is on (normal stream mode), OR
 *  - The device is currently in an active PIR recording session with PIR AI recording enabled
 *    (temporary AI enable during PIR event, even if stream AI detection is off).
 *
 * @param {object} device              - The device state object from the devices Map.
 * @param {object} settings
 * @param {boolean} settings.globalAiEnabled
 * @param {boolean} settings.globalStreamAiDetection
 * @param {boolean} settings.globalPirAiRecording
 * @param {boolean} settings.globalObjectTracking
 * @returns {boolean}
 */
function shouldEnqueueStreamFrame(device, { globalAiEnabled, globalStreamAiDetection, globalPirAiRecording, globalObjectTracking, cameraDetectionMode }) {
  // If AI processing is globally disabled, skip entirely unless we're in Pixel or Hybrid mode which doesn't need YOLO (but pixel stream still runs logic)
  if (!globalAiEnabled && cameraDetectionMode !== 'Pixel' && cameraDetectionMode !== 'Hybrid') return false;

  // In Pixel/Hybrid mode, we ALWAYS process every frame using pixel motion diff
  if (cameraDetectionMode === 'Pixel' || cameraDetectionMode === 'Hybrid') return true;

  // Normal stream AI path
  if (globalStreamAiDetection) return true;

  // Object tracking active
  if (globalObjectTracking) return true;

  // Temporary AI enable: PIR recording is active and PIR AI recording is enabled
  if (device && device.isPirActive && device.isRecordingAi && globalPirAiRecording) return true;

  return false;
}

/**
 * Determines whether the high-res PIR snapshot should be analysed by AI.
 *
 * Returns true when global AI is on AND at least one of the PIR AI features is active
 * (PIR AI detection OR PIR AI recording).
 *
 * @param {object} settings
 * @param {boolean} settings.globalAiEnabled
 * @param {boolean} settings.globalPirAiDetection
 * @param {boolean} settings.globalPirAiRecording
 * @returns {boolean}
 */
function shouldRunPirSnapshotAI({ globalAiEnabled, globalPirAiDetection, globalPirAiRecording }) {
  return globalAiEnabled && (globalPirAiDetection || globalPirAiRecording);
}

/**
 * Determines whether the AI worker should process a queued frame for a given device.
 *
 * The worker may proceed when:
 *  - Global AI is enabled (for stream AI), OR
 *  - The device is in an active PIR recording session with PIR AI recording enabled.
 *
 * @param {object} device              - The device state object from the devices Map.
 * @param {object} settings
 * @param {boolean} settings.globalAiEnabled
 * @param {boolean} settings.globalPirAiRecording
 * @param {boolean} settings.globalObjectTracking
 * @returns {boolean}
 */
function shouldWorkerProcessFrame(device, { globalAiEnabled, globalPirAiRecording, globalObjectTracking, cameraDetectionMode }) {
  if (cameraDetectionMode === 'Pixel' || cameraDetectionMode === 'Hybrid') return true;
  if (globalAiEnabled) return true;
  if (device && device.isPirActive && device.isRecordingAi && globalPirAiRecording) return true;
  return false;
}

module.exports = { shouldEnqueueStreamFrame, shouldRunPirSnapshotAI, shouldWorkerProcessFrame };
