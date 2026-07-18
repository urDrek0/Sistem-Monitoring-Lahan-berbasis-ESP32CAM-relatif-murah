const udpFrameAssemblies = new Map();
const wsFrameAssemblies = new Map();

function processChunkedMessage(deviceId, remoteIp, msg, assembliesMap, onFrameComplete) {
  if (msg.length < 4) return; // Invalid packet

  const frameId = msg[0];
  const totalChunks = msg[1];
  const chunkIndex = msg[2];
  const chunkData = msg.subarray(4);

  // Get or create the device's frames map
  let deviceFrames = assembliesMap.get(deviceId);
  if (!deviceFrames) {
    deviceFrames = new Map();
    assembliesMap.set(deviceId, deviceFrames);
  }

  // Get or create the specific frame assembly
  let assembly = deviceFrames.get(frameId);
  if (!assembly) {
    assembly = {
      totalChunks: totalChunks,
      chunks: new Map(),
      timestamp: Date.now()
    };
    deviceFrames.set(frameId, assembly);
  }

  // Store the chunk
  assembly.chunks.set(chunkIndex, chunkData);
  assembly.timestamp = Date.now();

  // If we have received all chunks, reassemble and process the frame
  if (assembly.chunks.size === totalChunks) {
    const chunkBuffers = [];
    let isComplete = true;
    for (let i = 0; i < totalChunks; i++) {
      const chunk = assembly.chunks.get(i);
      if (!chunk) {
        isComplete = false;
        break;
      }
      chunkBuffers.push(chunk);
    }

    if (isComplete) {
      const completedFrame = Buffer.concat(chunkBuffers);
      // Clean up completed frame from active assemblies list
      deviceFrames.delete(frameId);

      // Clean up older frames for this device to prevent late packet interference
      for (const [fid, fasm] of deviceFrames.entries()) {
        if (fasm.timestamp < assembly.timestamp) {
          deviceFrames.delete(fid);
        }
      }

      onFrameComplete(deviceId, remoteIp, completedFrame);
    }
  }
}

// Periodic cleanup of incomplete frame assemblies to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  
  const cleanupMap = (map) => {
    for (const [deviceId, deviceFrames] of map.entries()) {
      for (const [frameId, assembly] of deviceFrames.entries()) {
        if (now - assembly.timestamp > 2000) { // Discard if no new chunk for 2 seconds
          deviceFrames.delete(frameId);
        }
      }
      if (deviceFrames.size === 0) {
        map.delete(deviceId);
      }
    }
  };

  cleanupMap(udpFrameAssemblies);
  cleanupMap(wsFrameAssemblies);
}, 5000);

module.exports = {
  udpFrameAssemblies,
  wsFrameAssemblies,
  processChunkedMessage
};
