import { createI18n } from 'vue-i18n'

const messages = {
  en: {
    nav: {
      storage: 'STORAGE',
      normalView: 'Normal View',
      mobileView: 'Mobile View',
      wsOnline: 'Online',
      wsOffline: 'Offline',
      aiDisabled: 'DISABLED',
      aiOffline: 'OFFLINE',
      aiDetecting: 'DETECTING',
      aiScanning: 'SCANNING'
    },
    stream: {
      offline: 'OFFLINE',
      cameraOffline: 'Camera Offline',
      noOnlineCameras: 'No Online Cameras',
      multipleView: 'Multiple View',
      singleView: 'Single View',
      servoPtz: 'Servo (PTZ)',
      waiting: 'Waiting for Stream...',
      sweeping: 'Sweeping',
      sweepOnce: 'Sweep'
    },
    devices: {
      title: 'Devices'
    },
    events: {
      title: 'Events Logs',
      playback: 'Playback',
      triggerLogs: 'Trigger Logs',
      clearDay: 'Clear Day',
      human: 'HUMAN',
      noEvents: 'No Events',
      prev: 'Prev',
      next: 'Next',
      page: 'Page',
      of: 'of',
      on: 'on'
    },
    playback: {
      playback: 'PLAYBACK',
      paused: 'PAUSED',
      playbackResolved: 'PLAYBACK RESOLVED',
      todaysRecordings: "Today's Recordings Index",
      noRecordings: 'No recordings for this date'
    },
    settings: {
      title: 'System Settings',
      save: 'Save Settings',
      tabs: {
        pir: 'PIR Sensor',
        telegram: 'Telegram',
        camera: 'Camera Detection',
        other: 'Other'
      },
      pir: {
        enable: 'Enable PIR Sensor',
        enableDesc: 'Activate physical hardware PIR sensor monitoring',
        cooldown: 'Trigger Cooldown Interval',
        cooldownDesc: 'Minimum time between hardware PIR detection triggers',
        record: 'Record Video',
        recordDesc: 'Record a video clip automatically on PIR trigger events'
      },
      telegram: {
        subscriptions: 'Alert Event Subscriptions',
        pirTriggers: 'PIR Sensor Triggers',
        pirTriggersDesc: 'Send instant snapshots to Telegram on PIR activity',
        aiTriggers: 'AI Detection Triggers',
        aiTriggersDesc: 'Send alarm clip summaries on verified human detections',
        motionTriggers: 'Pixel / Hybrid Motion Triggers',
        motionTriggersDesc: 'Send general motion or verified hybrid warnings',
        cooloff: 'Notification Cool-off',
        cooloffDesc: 'Minimum time between consecutive Telegram alerts (global)'
      },
      camera: {
        enable: 'Enable Camera Detection',
        enableDesc: 'Activate real-time frame detection alerts',
        engineMode: 'Detection Engine Mode',
        engineModeDesc: 'Select whether to run YOLO neural network, cheap pixel differencing, or a Hybrid of both',
        modeAi: 'AI (YOLO)',
        modePixel: 'Pixel Comparison',
        modeHybrid: 'Hybrid',
        
        streamAi: 'Stream Camera Detection',
        streamAiDesc: 'Enables AI object detection on live stream frames',
        captureStream: 'Capture Stream Camera',
        captureStreamDesc: 'Capture and save snapshot to gallery when human is detected',
        recStream: 'Stream Camera Recording',
        recStreamDesc: 'Record video clip when human is detected on stream',
        
        pirAi: 'PIR Sensor AI Detection',
        pirAiDesc: 'Enables AI object detection on PIR sensor events',
        pirAiRec: 'PIR Sensor AI Recording',
        pirAiRecDesc: 'Continuous recording as long as there is an object detected',
        
        aiTracking: 'AI Camera Object Tracking',
        aiTrackingDesc: 'Camera servo follows detected human objects',
        
        tunerParams: 'Detection Tuner Parameters',
        captureMotion: 'Capture Motion Image',
        captureMotionDesc: 'Capture and save snapshot to gallery when motion is detected',
        captureDelay: 'Capture Delay',
        captureDelayDesc: 'Delay in milliseconds before capturing the snapshot image',
        recordMotion: 'Record Motion Video',
        recordMotionDesc: 'Record and save video clip when motion is detected',
        
        compMode: 'Comparison Mode',
        compModeDesc: 'Static compares to background; F2F compares consecutive frames',
        modeStaticRef: 'Static Reference',
        modeF2f: 'Frame-to-Frame',
        
        staticReset: 'Static Reset Interval',
        staticResetDesc: 'Periodically rebuilds the static background reference after 1, 2, or 3 seconds to adapt to rapid lighting changes',
        
        motionSens: 'Motion Sensitivity',
        motionSensDesc: 'Higher sensitivity (lower threshold value) makes the detector more reactive to minor pixel changes',
        sensHigh: 'High',
        sensMedium: 'Medium',
        sensLow: 'Low',
        sensExtraLow: 'Extra Low',
        
        mergeBoxes: 'Merge Bounding Boxes',
        mergeBoxesDesc: 'Combine all separate motion rectangles into a single outer box',
        minContour: 'Min Contour Size',
        minContourDesc: 'Minimum width or height of a motion block to trigger the combined merge box',
        clusterDist: 'Clustering Distance',
        clusterDistDesc: 'Distance threshold in pixels to group adjacent motion boxes',
        
        motionTracking: 'Motion Tracking',
        motionTrackingDesc: 'Camera servo follows detected motion bounding boxes',
        
        recDuration: 'Video Recording Duration',
        recDurationDesc: 'Controls both AI Stream Recording and PIR Video Recording duration',
        durContinuous: 'Continuous',
        
        maxDuration: 'Max Video Duration Compress',
        maxDurationDesc: 'Compresses and speeds up output video if recording duration exceeds this limit'
      },
      other: {
        webSound: 'Kiosk Web Alert Sound',
        webSoundDesc: 'Play alarm audio chime in browser on motion/AI detections',
        udpStream: 'UDP Livestream Mode',
        udpStreamDesc: 'Stream binary frames via UDP to port 3001 instead of WebSockets (reduces latency)',
        fpsMeter: 'Show FPS Meter',
        fpsMeterDesc: 'Display the real-time frame rate (FPS) overlay on video feeds'
      }
    },
    servo: {
      title: 'Servo Configuration',
      defaultAngle: 'DEFAULT ANGLE',
      autoReturn: 'AUTO-RETURN DELAY',
      autoReturnDesc: 'Wait time before the servo automatically returns to its default angle',
      pirMapping: 'PIR SENSOR MAPPING',
      left: 'LEFT',
      mid: 'MID',
      right: 'RIGHT',
      fovVisualizer: '69° FOV ROTATION VISUALIZER',
      servoSweep: 'SERVO SWEEP',
      sweepDesc: 'Configure automatic sweeping interval or continuous mode',
      continuous: 'Continuous',
      save: 'Save Settings',
      sec: 's',
      min: 'min',
      disabled: 'Disabled'
    },
    cameraConfig: {
      title: 'Camera Configuration',
      targetSensor: 'TARGET SENSOR',
      resAndQual: 'Resolution & Quality',
      reset: 'Reset',
      scaleMode: 'Scale Mode',
      modeStatic: 'Static (Single Configuration)',
      modeDynamic: 'Dynamic (Signal Strength Based)',
      resolution: 'Resolution',
      quality: 'Quality',
      bandwidthScaling: 'Bandwidth Scaling Options',
      imageTuning: 'Image Tuning',
      brightness: 'Brightness',
      contrast: 'Contrast',
      saturation: 'Saturation',
      filtersExposure: 'Filters & Exposure Controls',
      specialEffect: 'Special Effect',
      effectNone: 'None (Normal)',
      effectNegative: 'Negative',
      effectGrayscale: 'Grayscale',
      effectRed: 'Red Tint',
      effectGreen: 'Green Tint',
      effectBlue: 'Blue Tint',
      effectSepia: 'Sepia',
      hmirror: 'H-Mirror',
      vflip: 'V-Flip',
      hardwareCapture: 'Hardware & Capture Settings',
      xclkFreq: 'XCLK Frequency',
      flashCapture: 'Flash on Capture',
      save: 'Save Camera Settings'
    }
  },
  id: {
    nav: {
      storage: 'PENYIMPANAN',
      normalView: 'Tampilan Normal',
      mobileView: 'Tampilan HP',
      wsOnline: 'Online',
      wsOffline: 'Offline',
      aiDisabled: 'DINONAKTIFKAN',
      aiOffline: 'LURING',
      aiDetecting: 'MENDETEKSI',
      aiScanning: 'MEMINDAI'
    },
    stream: {
      offline: 'OFFLINE',
      cameraOffline: 'Kamera Offline',
      noOnlineCameras: 'Tidak Ada Kamera Online',
      multipleView: 'Tampilan Grid',
      singleView: 'Tampilan Tunggal',
      servoPtz: 'Servo (PTZ)',
      waiting: 'Menunggu Aliran Video...',
      sweeping: 'Menyapu',
      sweepOnce: 'Sapu'
    },
    devices: {
      title: 'Perangkat'
    },
    events: {
      title: 'Log Kejadian',
      playback: 'Pemutaran',
      triggerLogs: 'Log Pemicu',
      clearDay: 'Hapus Hari Ini',
      human: 'MANUSIA',
      noEvents: 'Tidak Ada Kejadian',
      prev: 'Sebelumnya',
      next: 'Berikutnya',
      page: 'Halaman',
      of: 'dari',
      on: 'pada'
    },
    playback: {
      playback: 'PEMUTARAN',
      paused: 'JEDA',
      playbackResolved: 'PEMUTARAN SELESAI',
      todaysRecordings: 'Indeks Rekaman Hari Ini',
      noRecordings: 'Tidak ada rekaman untuk tanggal ini'
    },
    settings: {
      title: 'Pengaturan Sistem',
      save: 'Simpan Pengaturan',
      tabs: {
        pir: 'Sensor PIR',
        telegram: 'Telegram',
        camera: 'Deteksi Kamera',
        other: 'Lainnya'
      },
      pir: {
        enable: 'Aktifkan Sensor PIR',
        enableDesc: 'Aktifkan pemantauan sensor PIR perangkat keras fisik',
        cooldown: 'Interval Cooldown Pemicu',
        cooldownDesc: 'Waktu minimum antara pemicu deteksi PIR perangkat keras',
        record: 'Rekam Video',
        recordDesc: 'Rekam klip video secara otomatis saat sensor PIR dipicu'
      },
      telegram: {
        subscriptions: 'Langganan Notifikasi Kejadian',
        pirTriggers: 'Pemicu Sensor PIR',
        pirTriggersDesc: 'Kirim foto instan ke Telegram saat ada aktivitas PIR',
        aiTriggers: 'Pemicu Deteksi AI',
        aiTriggersDesc: 'Kirim ringkasan klip alarm saat terdeteksi manusia terverifikasi',
        motionTriggers: 'Pemicu Gerakan Piksel / Hibrida',
        motionTriggersDesc: 'Kirim peringatan gerakan umum atau hibrida terverifikasi',
        cooloff: 'Cooldown Notifikasi',
        cooloffDesc: 'Waktu minimum antara notifikasi Telegram berturut-turut (global)'
      },
      camera: {
        enable: 'Aktifkan Deteksi Kamera',
        enableDesc: 'Aktifkan peringatan deteksi bingkai waktu nyata',
        engineMode: 'Mode Mesin Deteksi',
        engineModeDesc: 'Pilih apakah akan menjalankan jaringan saraf YOLO, perbedaan piksel ringan, atau Hibrida keduanya',
        modeAi: 'AI (YOLO)',
        modePixel: 'Perbandingan Piksel',
        modeHybrid: 'Hibrida',
        
        streamAi: 'Deteksi AI Aliran Kamera',
        streamAiDesc: 'Mengaktifkan deteksi objek AI pada bingkai aliran langsung',
        captureStream: 'Ambil Foto Aliran Kamera',
        captureStreamDesc: 'Ambil dan simpan foto ke galeri saat manusia terdeteksi',
        recStream: 'Rekaman Aliran Kamera',
        recStreamDesc: 'Rekam klip video saat manusia terdeteksi di aliran kamera',
        
        pirAi: 'Deteksi AI Sensor PIR',
        pirAiDesc: 'Mengaktifkan deteksi objek AI pada kejadian sensor PIR',
        pirAiRec: 'Rekaman AI Sensor PIR',
        pirAiRecDesc: 'Perekaman terus menerus selama ada objek yang terdeteksi',
        
        aiTracking: 'Pelacakan Objek Kamera AI',
        aiTrackingDesc: 'Servo kamera mengikuti objek manusia yang terdeteksi',
        
        tunerParams: 'Parameter Penyetel Deteksi',
        captureMotion: 'Ambil Gambar Gerakan',
        captureMotionDesc: 'Ambil dan simpan foto ke galeri saat gerakan terdeteksi',
        captureDelay: 'Tunda Pengambilan',
        captureDelayDesc: 'Penundaan dalam milidetik sebelum mengambil foto snapshot',
        recordMotion: 'Rekam Video Gerakan',
        recordMotionDesc: 'Rekam dan simpan klip video saat gerakan terdeteksi',
        
        compMode: 'Mode Perbandingan',
        compModeDesc: 'Statis membandingkan dengan latar belakang; F2F membandingkan bingkai berturut-turut',
        modeStaticRef: 'Referensi Statis',
        modeF2f: 'Bingkai-ke-Bingkai (F2F)',
        
        staticReset: 'Interval Atur Ulang Statis',
        staticResetDesc: 'Membangun kembali referensi latar belakang statis secara berkala setelah 1, 2, atau 3 detik untuk menyesuaikan dengan perubahan cahaya cepat',
        
        motionSens: 'Sensitivitas Gerakan',
        motionSensDesc: 'Sensitivitas lebih tinggi (nilai ambang lebih rendah) membuat detektor lebih reaktif terhadap perubahan piksel kecil',
        sensHigh: 'Tinggi',
        sensMedium: 'Sedang',
        sensLow: 'Rendah',
        sensExtraLow: 'Sangat Rendah',
        
        mergeBoxes: 'Gabungkan Kotak Pembatas',
        mergeBoxesDesc: 'Gabungkan semua persegi panjang gerakan terpisah menjadi satu kotak luar',
        minContour: 'Ukuran Kontur Min',
        minContourDesc: 'Lebar atau tinggi minimum blok gerakan untuk memicu penggabungan kotak',
        clusterDist: 'Jarak Pengelompokan',
        clusterDistDesc: 'Ambang batas jarak dalam piksel untuk mengelompokkan kotak gerakan yang berdekatan',
        
        motionTracking: 'Pelacakan Gerakan',
        motionTrackingDesc: 'Servo kamera mengikuti kotak pembatas gerakan yang terdeteksi',
        
        recDuration: 'Durasi Perekaman Video',
        recDurationDesc: 'Mengontrol durasi Rekaman Aliran AI dan Rekaman Video PIR',
        durContinuous: 'Terus Menerus',
        
        maxDuration: 'Kompresi Durasi Video Maks',
        maxDurationDesc: 'Mengompresi dan mempercepat video keluaran jika durasi perekaman melebihi batas ini'
      },
      other: {
        webSound: 'Suara Peringatan Web Kios',
        webSoundDesc: 'Putar suara alarm di browser pada deteksi gerakan/AI',
        udpStream: 'Mode Aliran Langsung UDP',
        udpStreamDesc: 'Alirkan bingkai biner melalui UDP ke port 3001 alih-alih WebSocket (mengurangi latensi)',
        fpsMeter: 'Tampilkan Pengukur FPS',
        fpsMeterDesc: 'Tampilkan hamparan frame rate (FPS) waktu nyata pada umpan video'
      }
    },
    servo: {
      title: 'Konfigurasi Servo',
      defaultAngle: 'SUDUT DEFAULT',
      autoReturn: 'TUNDA KEMBALI OTOMATIS',
      autoReturnDesc: 'Waktu tunggu sebelum servo otomatis kembali ke sudut default',
      pirMapping: 'PEMETAAN SENSOR PIR',
      left: 'KIRI',
      mid: 'TENGAH',
      right: 'KANAN',
      fovVisualizer: 'VISUALISASI ROTASI FOV 69°',
      servoSweep: 'SAPUAN SERVO',
      sweepDesc: 'Konfigurasi interval sapuan otomatis atau mode terus-menerus',
      continuous: 'Terus Menerus',
      save: 'Simpan Pengaturan',
      sec: 'd',
      min: 'mnt',
      disabled: 'Nonaktif'
    },
    cameraConfig: {
      title: 'Konfigurasi Kamera',
      targetSensor: 'SENSOR TARGET',
      resAndQual: 'Resolusi & Kualitas',
      reset: 'Atur Ulang',
      scaleMode: 'Mode Skala',
      modeStatic: 'Statis (Konfigurasi Tunggal)',
      modeDynamic: 'Dinamis (Berdasarkan Kekuatan Sinyal)',
      resolution: 'Resolusi',
      quality: 'Kualitas',
      bandwidthScaling: 'Opsi Penskalaan Bandwidth',
      imageTuning: 'Penyetelan Gambar',
      brightness: 'Kecerahan',
      contrast: 'Kontras',
      saturation: 'Saturasi',
      filtersExposure: 'Filter & Kontrol Eksposur',
      specialEffect: 'Efek Khusus',
      effectNone: 'Tidak Ada (Normal)',
      effectNegative: 'Negatif',
      effectGrayscale: 'Skala Abu-abu',
      effectRed: 'Rona Merah',
      effectGreen: 'Rona Hijau',
      effectBlue: 'Rona Biru',
      effectSepia: 'Sepia',
      hmirror: 'Cermin Horizontal',
      vflip: 'Balik Vertikal',
      hardwareCapture: 'Pengaturan Perangkat Keras & Pengambilan',
      xclkFreq: 'Frekuensi XCLK',
      flashCapture: 'Lampu Kilat saat Mengambil',
      save: 'Simpan Pengaturan Kamera'
    }
  }
}

export const i18n = createI18n({
  legacy: false, // use Composition API
  locale: localStorage.getItem('kiosk_locale') || 'id',
  fallbackLocale: 'en',
  messages,
})
