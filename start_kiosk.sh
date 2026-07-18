#!/bin/bash

# =======================================================
# AUTOLOAD SCRIPT UNTUK SURVEILLANCE KIOSK (RASPBERRY PI)
# =======================================================

# 1. Tentukan Base Direktori di Raspberry Pi
# Ubah path ini jika letak foldernya berbeda di Raspberry Pi
BASE_DIR="/home/momoy/Desktop"

echo "Memulai Surveillance Kiosk System..."

# 2. Jalankan Backend Server (Background)
echo "Menjalankan Backend..."
cd $BASE_DIR/backendAndTelegramBot
# Jika di pi menjalankan dengan npm run dev, pastikan npm terinstall.
npm run dev > backend.log 2>&1 &

# 3. Jalankan Frontend Kiosk (Background)
echo "Menjalankan Frontend..."
cd $BASE_DIR/cameraKiosk
npm run dev > frontend.log 2>&1 &

# 4. Jalankan AI Human Detection (Background)
echo "Menjalankan AI Human Detection..."
cd $BASE_DIR/human_detection
bash start.sh > ai.log 2>&1 &

# 5. Warming Up (Tunggu beberapa detik agar server siap sebelum browser dibuka)
echo "Tunggu 15 detik agar proses siap..."
sleep 15

# 6. Buka Browser (Chromium Kiosk Mode)
echo "Membuka Kiosk Browser..."
# Kiosk = Fullscreen no UI, Start-fullscreen = mode layar penuh
# Jika perintah chromium-browser tidak ditemukan, coba gunakan 'chromium' atau 'firefox'
# chromium --kiosk --start-fullscreen http://localhost:5173
chromium-browser --kiosk --start-fullscreen http://localhost:5173

echo "Setup Selesai!"
