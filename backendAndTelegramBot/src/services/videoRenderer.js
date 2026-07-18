const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '../../../data/tmp');

// Pastikan direktori tmp ada
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Render array of JPEG buffers into an MP4 video using FFmpeg.
 * Uses hardware encoder (h264_v4l2m2m) suited for Raspberry Pi 3.
 * 
 * @param {Buffer[]} frameBuffers Array of JPEG buffers
 * @param {String} outputFilename Nama file output mp4
 * @returns {Promise<String>} Path ke file video yang dihasilkan
 */
function renderVideo(frameBuffers, outputFilename, maxDuration = 30) {
  return new Promise((resolve, reject) => {
    if (!frameBuffers || frameBuffers.length === 0) {
      return reject(new Error('No frames provided for video rendering'));
    }

    const sessionId = Date.now();
    const sessionDir = path.join(TMP_DIR, `session_${sessionId}`);
    fs.mkdirSync(sessionDir, { recursive: true });

    // Tulis frame ke disk secara ASYNCHRONOUS agar tidak memblokir event loop Node.js
    // Blocking event loop saat menulis file (I/O) dapat menyebabkan WebSocket putus (Disconnected)
    const writePromises = frameBuffers.map((buffer, index) => {
      const paddedIndex = String(index).padStart(3, '0');
      const framePath = path.join(sessionDir, `frame_${paddedIndex}.jpg`);
      return fs.promises.writeFile(framePath, buffer);
    });

    Promise.all(writePromises).then(() => {
      const videosDir = path.join(__dirname, '../../../data/videos');
      if (!fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true });
      }
      const outputPath = path.join(videosDir, outputFilename);

      const N = frameBuffers.length;
      let inputFramerate = 10;
      const maxFrames = maxDuration * 10;
      if (N > maxFrames) {
        inputFramerate = Math.round(N / maxDuration);
        if (inputFramerate < 10) inputFramerate = 10;
        console.log(`[VideoRenderer] Frame count ${N} exceeds ${maxFrames} (${maxDuration}s at 10fps). Speeding up input framerate to ${inputFramerate} fps.`);
      }

      // Command menggunakan Software Encoder (libx264) yang 100% kompatibel dan aman.
      // Ditambahkan flag faststart dan baseline profile agar Telegram tidak menolak format videonya.
      // Menggunakan -r 10 untuk memaksa output video memiliki format frame rate standar 10 fps agar Telegram kompatibel.
      const inputPattern = path.join(sessionDir, 'frame_%03d.jpg');
      let ffmpegCmd;
      if (process.platform === 'win32') {
        ffmpegCmd = `ffmpeg -y -framerate ${inputFramerate} -i "${inputPattern}" -r 10 -c:v libx264 -preset ultrafast -crf 30 -profile:v baseline -level 3.0 -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
      } else {
        ffmpegCmd = `nice -n 19 ffmpeg -y -framerate ${inputFramerate} -i "${inputPattern}" -r 10 -c:v libx264 -preset ultrafast -crf 30 -profile:v baseline -level 3.0 -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
      }

      console.log(`[VideoRenderer] Memulai rendering video: ${ffmpegCmd}`);

      exec(ffmpegCmd, (error, stdout, stderr) => {
        // Cleanup file temporary (frame JPEG)
        fs.rmSync(sessionDir, { recursive: true, force: true });

        if (error) {
          console.error(`[VideoRenderer] FFmpeg gagal:`, error.message);
          return reject(error);
        }

        // Validasi apakah file benar-benar terbuat dan tidak kosong
        try {
          const stats = fs.statSync(outputPath);
          if (stats.size < 1000) {
            throw new Error(`Output video terlalu kecil (${stats.size} bytes), kemungkinan gagal render.`);
          }
        } catch (statErr) {
          console.error(`[VideoRenderer] Validasi file gagal:`, statErr.message);
          return reject(statErr);
        }

        console.log(`[VideoRenderer] Rendering selesai: ${outputPath}`);
        resolve(outputPath);
      });
    }).catch(err => {
      // Cleanup jika gagal tulis
      fs.rmSync(sessionDir, { recursive: true, force: true });
      reject(err);
    });
  });
}

module.exports = { renderVideo };
