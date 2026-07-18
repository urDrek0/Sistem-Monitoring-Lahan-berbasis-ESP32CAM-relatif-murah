# Sistem Monitoring Keamanan & Bounding Box AI Berbasis ESP32-CAM

Sistem monitoring keamanan pintar berbasis IoT yang mengintegrasikan kamera **ESP32-CAM**, sensor gerak PIR multi-arah, motor servo pemutar kamera otomatis, kecerdasan buatan (AI) untuk deteksi dan pelacakan manusia (*Object Tracking*), serta bot Telegram untuk notifikasi instan berupa foto dan rekaman video kejadian secara *real-time*.

---

## Daftar Isi
1. [Fitur Utama](#fitur-utama)
2. [Arsitektur Sistem](#arsitektur-sistem)
3. [Alur Kerja Deteksi Keamanan](#alur-kerja-deteksi-keamanan)
4. [Setup Hardware & Perkabelan ESP32-CAM](#setup-hardware--perkabelan-esp32-cam)
5. [Panduan Instalasi Aplikasi (Server-Side)](#panduan-instalasi-aplikasi-server-side)
6. [Panduan Pengoperasian Aplikasi](#panduan-pengoperasian-aplikasi)
7. [Konfigurasi Sensor & Kamera](#konfigurasi-sensor--kamera)
8. [Demo Aplikasi](#demo-aplikasi)

---

## Fitur Utama

### 1. Pelacakan Gerakan Otomatis (PIR-Triggered Servo Rotation)
* Menggunakan 3 sensor PIR (Kiri, Tengah, Kanan) untuk mendeteksi pergerakan di area sekitar kamera.
* Kamera akan secara otomatis berputar (menggunakan Motor Servo) mengarah ke lokasi PIR yang mendeteksi gerakan secara presisi.

### 2. Deteksi Manusia & Object Tracking Berbasis AI (Python Object Detection)
* Backend Node.js mengirimkan frame video ke server AI berbasis Python.
* Menampilkan *bounding box* (kotak pelacak) di sekitar tubuh manusia secara *real-time* pada antarmuka Kiosk UI.
* **Fitur Object Tracking**: Motor servo akan secara dinamis terus menyesuaikan sudut (*panning*) untuk mengikuti pergerakan manusia di dalam jangkauan kamera berdasarkan posisi *bounding box*.
* AI diatur secara terpusat (*Centralized AI Controller*) sehingga dapat berjalan efisien baik untuk mode Live Stream maupun untuk trigger kejadian (Event) PIR.

### 3. Sistem Perekaman Video Cerdas
* Perekaman kejadian berjalan otomatis saat terdeteksi gerakan oleh PIR atau AI.
* **Dynamic Timeout**: Jika AI menyala, rekaman akan dipertahankan dengan *grace period* dinamis dan *fallback timeout* hingga 90 detik. Jika AI mati, rekaman akan berjalan dengan durasi statis 10 detik.
* Frame dikumpulkan dalam *rolling buffer* dan di-render menjadi file video `.mp4` menggunakan FFmpeg tanpa mengganggu kinerja *streaming* (*Asynchronous Rendering*).

### 4. Live Streaming Video Real-Time
* Streaming video format MJPEG dari ESP32-CAM yang dikirim langsung melalui protokol WebSocket dengan latensi sangat rendah.
* Mendukung mode tampilan **Single View** (fokus pada satu kamera aktif) dan **Multiple View** (monitoring banyak kamera sekaligus).

### 5. Skala Resolusi & Kualitas Dinamis (Dynamic Resolution Scaling)
* Kamera memantau kekuatan sinyal Wi-Fi dalam satuan dBm secara berkala (setiap 8 detik).
* Sistem secara otomatis menaikkan atau menurunkan resolusi dan kualitas gambar ESP32-CAM berdasarkan kekuatan sinyal (Level 5 s.d. Level 1) untuk mencegah *lag* saat koneksi tidak stabil.

### 6. Panel Kontrol Kamera & Tuning Gambar (Kiosk UI)
* Pengaturan sensor kamera secara *remote*: Kecerahan, Kontras, Saturasi, AWB, AEC, AGC, Efek Khusus, H-Mirror, V-Flip.
* Kontrol sudut Servo manual secara interaktif.
* Pengaturan intensitas lampu Flash LED kamera (dikendalikan secara halus melalui sinyal PWM/LEDC).

### 7. Integrasi Bot Telegram & Alert Log
* Mengirimkan peringatan instan ke pengguna Telegram.
* Notifikasi memuat **Foto Snapshot Resolusi Tinggi (FHD)** dengan *bounding box* hasil deteksi AI, beserta **Video MP4** rekaman kejadian.
* Semua kejadian tersimpan di sistem *logger* lokal dan dapat diputar ulang melalui dashboard.

---

## Arsitektur Sistem

Sistem ini terbagi menjadi 4 komponen utama yang saling terhubung dengan alur komunikasi data yang telah dioptimalkan:

```
+-------------------+             WebSocket (Frames)            +--------------------+
|                   |------------------------------------------>|                    |
|     ESP32-CAM     |                                           |   Node.js Server   |
|   (C++ / Sketch)  |<------------------------------------------| (backendAndBot/src)|
|                   |            Config & Commands              +--------------------+
+-------------------+                                               |    ^          |
    ^           |                                     TCP Socket    |    |          | WebSocket
    |           v                                     for AI        v    |          | & HTTP
+-------------------+                                           +------------+      | (Live Stream)
| PIR Sensors (3x)  |                                           | Python AI  |      v
| & Motor Servo     |                                           | (Detector) |  +--------------------+
+-------------------+                                           +------------+  |  Vue Kiosk Frontend|
                                                                                |  (cameraKiosk/src) |
                                                                                +--------------------+
```

1. **ESP32-CAM Client (C++/Arduino)**: Menangani akuisisi gambar, membaca sensor PIR secara presisi melalui *FreeRTOS tasks*, mengatur putaran motor servo, lampu flash PWM, dan mengirim frame via WebSocket biner.
2. **Backend Server (Node.js)**: Bertindak sebagai gateway utama, mengelola *state* dan *event* kamera melalui `websocket.js`, dan menengahi (*gatekeeper*) deteksi AI menggunakan `aiController.js`. Proses penerimaan gambar resolusi tinggi (FHD) dilakukan secara terpisah melalui HTTP REST (`routes.js`) agar lebih efisien, sebelum didelegasikan ke pemrosesan WebSocket.
3. **AI Detector (Python & OpenCV)**: Memproses gambar mentah untuk melakukan deteksi objek (model *TinyML/YOLO*) dan mengembalikan data koordinat orang (*bounding box*).
4. **Vue Kiosk UI**: Dashboard modern untuk pemantauan dan konfigurasi langsung.

---

## Alur Kerja Deteksi Keamanan

[tambahkan gambar alur_deteksi_keamanan disini]

1. Sensor PIR mendeteksi adanya gerakan di salah satu sisi (Kiri/Tengah/Kanan).
2. Motor servo memutar kamera dengan mulus (*smooth transition*) mengarah ke lokasi gerakan.
3. Kamera mengirimkan permintaan *capture* gambar Resolusi Tinggi (FHD) via *HTTP POST* ke Node.js, diikuti pembaruan status ke sistem WebSocket backend.
4. Backend memulai sesi rekaman video (*Video Recording Session*) dan meneruskan gambar awal ke Server AI Python.
5. Jika AI mendeteksi manusia:
   * Fitur **Object Tracking** diaktifkan; kamera akan terus bergerak mengikuti arah pergeseran orang di dalam *frame*.
   * Render foto snapshot AI yang berisikan *bounding box* akan dikirim via Telegram sebagai *alert* seketika.
6. Saat manusia tidak lagi terdeteksi (setelah tenggang waktu *grace period* berakhir):
   * Backend menyetop penyimpanan *buffer* rekaman.
   * Modul perenderan memproses kumpulan *frame* JPEG menjadi video MP4 secara *asynchronous* menggunakan FFmpeg.
   * Video lengkap kemudian dikirimkan ke pengguna Telegram dan dicatat di *log* dasbor lokal.

---

## Setup Hardware & Perkabelan ESP32-CAM

[tambahkan gambar skema_perkabelan disini]

Berikut adalah konfigurasi pinout antara ESP32-CAM AI-Thinker dengan modul sensor PIR dan motor servo:

### 1. Skema Pinout
| Komponen | Pin Komponen | Pin ESP32-CAM | Deskripsi |
| :--- | :--- | :--- | :--- |
| **PIR Sensor (Kiri)** | OUT / Data | GPIO 13 | Input sinyal gerakan kiri |
| **PIR Sensor (Tengah)** | OUT / Data | GPIO 15 | Input sinyal gerakan tengah |
| **PIR Sensor (Kanan)** | OUT / Data | GPIO 14 | Input sinyal gerakan kanan |
| **Motor Servo** | PWM / Control | GPIO 12 | Kontrol sudut servo pemutar |
| **Flash LED** | Onboard | GPIO 4 | Lampu sorot flash (Built-in) dikontrol PWM |

### 2. Sumber Daya (Power Supply)
* **VCC & GND**: Hubungkan semua kaki VCC komponen PIR ke 5V, dan GND ke GND.
* **PENTING**: Motor servo menarik arus daya yang besar ketika berputar. Sangat disarankan untuk menggunakan **Power Supply Eksternal 5V (Minimal 2A)** untuk menyuplai servo secara terpisah. Pastikan untuk menghubungkan jalur **GND Power Supply Eksternal** dengan jalur **GND ESP32-CAM** (*Common Ground*) agar sinyal PWM kontrol dari ESP32 dapat dibaca dengan stabil oleh servo.

### 3. Konfigurasi Arduino IDE
1. Buka Arduino IDE dan buka file `camera_client_ws/camera_client_ws.ino`.
2. Pasang library `WebSockets` oleh Markus Sattler melalui Library Manager.
3. Konfigurasi papan pengembangan (Board) pada menu Tools:
   * Board: **AI Thinker ESP32-CAM**
   * PSRAM: **Enabled** (Wajib aktif untuk buffer *streaming* dan alokasi memori FHD)
   * Partition Scheme: **Huge APP (3MB No OTA/1MB SPIFFS)**
4. Ubah kredensial Wi-Fi Anda di baris konfigurasi `ssid` dan `password`.
5. *Compile* dan *Upload* program ke papan ESP32-CAM Anda.

---

## Panduan Instalasi Aplikasi (Server-Side)

### 1. Prasyarat Sistem & Spesifikasi Komputer Server
Sistem ini menggunakan kecerdasan buatan dan konversi rekaman video yang memerlukan daya komputasi secukupnya:
* **Perangkat Keras**: Raspberry Pi (3/4/5) atau Komputer PC/Laptop kelas i3/i5. RAM minimal **1 GB** (Direkomendasikan **2 GB** ke atas).
* **OS**: Linux OS (Ubuntu Server, Debian, Raspberry Pi OS, dll).
* **Perangkat Lunak**:
  * Node.js (v16+)
  * Python (v3.8+)
  * FFmpeg (wajib diinstal di sistem operasi Anda).

### 2. Instalasi Langkah demi Langkah

#### Langkah Awal: Kloning Repositori
```bash
git clone https://github.com/username/projectTaGateway.git
cd projectTaGateway
```

#### Langkah A: Setup Server Node.js (Backend)
1. Masuk ke folder backend:
   ```bash
   cd backendAndTelegramBot
   ```
2. Pasang dependensi:
   ```bash
   npm install
   ```
3. Buat file `.env` di dalam folder ini dan isi kredensial bot Telegram Anda:
   ```env
   TELEGRAM_BOT_TOKEN=TOKEN_BOT_TELEGRAM_ANDA
   TELEGRAM_AUTH_PASSWORD=PASSWORD_UNTUK_AUTENTIKASI_USER
   ```
4. Jalankan backend:
   ```bash
   npm run dev
   ```
   *(Server beroperasi di port 3000 dan dapat diakses dengan nama domain mDNS `gateway.local`)*

#### Langkah B: Setup AI Detector (Python)
1. Masuk ke folder detektor AI:
   ```bash
   cd human_detection
   ```
2. Buat & aktifkan *virtual environment*:
   ```bash
   python3 -m venv pc_env
   source pc_env/bin/activate
   ```
3. Pasang *library* yang dibutuhkan:
   ```bash
   pip install -r requirements.txt
   ```
4. Pastikan file model AI (misal: `yolo11n_int8.tflite`) sudah berada di folder proyek.
5. Jalankan *server* Python AI:
   ```bash
   ./start.sh
   ```

#### Langkah C: Setup Kiosk UI (Frontend)
1. Masuk ke folder aplikasi dasbor:
   ```bash
   cd cameraKiosk
   ```
2. Pasang dependensi Node:
   ```bash
   npm install
   ```
3. Jalankan server Kiosk:
   ```bash
   npm run dev
   ```
   *(Dasbor diakses via Web Browser di `http://localhost:5173`)*

---

## Panduan Pengoperasian Aplikasi

### 1. Menghubungkan Kamera & Sinkronisasi Kiosk
* Pastikan Server Node.js berjalan. ESP32-CAM akan secara otomatis terhubung mencari domain `gateway.local`.
* Kiosk akan secara *real-time* menampilkan status kamera berubah menjadi **Online (🟢)** dan saluran transmisi video akan langsung ditampilkan di dasbor.

### 2. Autentikasi Pengguna Telegram
* Di aplikasi Telegram, cari bot yang telah Anda buat. Tekan `/start`.
* Saat bot meminta *password*, kirim pesan dengan kata sandi autentikasi yang Anda tentukan di `.env` (contoh: `123123`).
* Apabila sukses, ID Telegram Anda akan terdaftar, dan notifikasi keamanan akan diarahkan langsung ke perangkat (*chat*) Anda.

### 3. Kendali Cerdas di Dasbor
* **Manual Control**: Ubah arah kamera memakai *slider* interaktif.
* **Camera Config**: Ubah sensitivitas cahaya, tingkat *brightness*, dan profil mode skala dinamis/statis kamera. Klik *Save* untuk memperbarui pengaturan *on-the-fly* (tanpa mematikan kamera).

---

## Konfigurasi Sensor & Kamera

[tambahkan gambar camera_configuration_modal disini]

1. Klik tombol **Configure Camera** di UI dasbor.
2. Pilih pengaturan **Scale Mode**:
   * **Static**: Streaming dipatok pada resolusi stabil tanpa menyesuaikan kekuatan sinyal.
   * **Dynamic**: Memungkinkan Anda untuk mendaftar 5 level kualitas *(Level 5 Excellent s.d. Level 1 Very Weak)*. Kamera akan mendeteksi level sinyal (RSSI dBm) dan menyeimbangkan kualitas *streaming* secara lincah agar *delay* tetap minimum.
3. Klik **Save Camera Settings**.
4. Gunakan tombol **Reset** (*Hardware Default*) kapan saja jika Anda ingin memulihkan semua penyetelan kontras/warna/resolusi kembali ke performa rata-rata terbaik (HVGA kualitas 22).

---

## Demo Aplikasi

[tambahkan gambar dashboard_monitoring disini]
*Tampilan dashboard pemantauan utama dengan panel kendali servo, streaming video seketika, dan daftar kejadian pergerakan.*

[tambahkan gambar telegram_notification_demo disini]
*Contoh peringatan (*alert*) pada Telegram berisikan pelacakan sasaran manusia (bounding box) dan video format MP4 hasil rekam jejak yang dirangkum oleh server Node.js.*
