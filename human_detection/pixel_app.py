import asyncio
import websockets
import json
import cv2
import numpy as np
import gc

import config

# State store dictionary mapping device_id -> state dict
# e.g., states[device_id] = { 'static_back': float_array, 'prev_frame': gray_blurred }
states = {}

async def handle_client(websocket, path=None):
    print(f"[INFO] Terhubung ke server pixel comparison, mulai mendengarkan stream...")
    try:
        async for message in websocket:
            if isinstance(message, bytes):
                try:
                    # Parse extended binary header payload:
                    # Bytes 0-3: request_id (UInt32BE)
                    # Byte 4: annotate (UInt8)
                    # Byte 5: sensitivity (UInt8)
                    # Byte 6: minAreaPercent (UInt8)
                    # Byte 7: mode (UInt8) -> 0: Static, 1: F2F
                    # Byte 8: merge (UInt8) -> 0: Off, 1: On
                    # Byte 9: deviceId length (UInt8)
                    # Bytes 10 to 10 + deviceId length: deviceId string
                    # Bytes 10 + deviceId length+: raw binary JPEG image
                    req_id = int.from_bytes(message[0:4], byteorder='big')
                    annotate = message[4] == 1
                    sensitivity = message[5]
                    min_area_percent = message[6]
                    mode = message[7]
                    merge = message[8]
                    dev_id_len = message[9]
                    
                    device_id = message[10:10+dev_id_len].decode('utf-8')
                    img_bytes = message[10+dev_id_len:]

                    nparr = np.frombuffer(img_bytes, np.uint8)
                    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                    if img is None:
                        await websocket.send(json.dumps({
                            "requestId": req_id,
                            "status": "error",
                            "message": "File gambar korup"
                        }))
                        continue

                    orig_h, orig_w = img.shape[:2]

                    # 1. Grayscale and Gaussian Blur
                    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                    gray_blurred = cv2.GaussianBlur(gray, (21, 21), 0)

                    # Get or initialize device state
                    if device_id not in states:
                        states[device_id] = {
                            'static_back': None,
                            'prev_frame': None
                        }
                    device_state = states[device_id]

                    # 2. Compute absolute difference based on mode
                    if mode == 0:
                        # Static Reference mode (with slow running weighted background update)
                        if device_state['static_back'] is None:
                            device_state['static_back'] = gray_blurred.copy().astype(np.float32)
                        else:
                            # Update background with 0.02 weight (2% learning rate) to slowly adapt to light drift
                            cv2.accumulateWeighted(gray_blurred, device_state['static_back'], 0.02)
                        
                        static_back_display = cv2.convertScaleAbs(device_state['static_back'])
                        diff = cv2.absdiff(static_back_display, gray_blurred)
                    else:
                        # Frame-to-Frame difference
                        if device_state['prev_frame'] is None:
                            device_state['prev_frame'] = gray_blurred.copy()
                        
                        diff = cv2.absdiff(device_state['prev_frame'], gray_blurred)
                        device_state['prev_frame'] = gray_blurred.copy()

                    # 3. Thresholding and Dilation
                    _, thresh = cv2.threshold(diff, sensitivity, 255, cv2.THRESH_BINARY)
                    thresh = cv2.dilate(thresh, None, iterations=2)

                    # 4. Find Contours
                    contours, _ = cv2.findContours(thresh.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

                    # Calculate minimum area threshold in absolute pixels based on width and height
                    min_area_pixels = orig_w * orig_h * (min_area_percent / 100.0)

                    # Filter contours by min area
                    qualifying_boxes = []
                    for contour in contours:
                        area = cv2.contourArea(contour)
                        if area >= min_area_pixels:
                            (x, y, w, h) = cv2.boundingRect(contour)
                            qualifying_boxes.append((x, y, w, h, area))

                    koordinat_kotak = []
                    if len(qualifying_boxes) > 0:
                        if merge == 1:
                            # Merge into a single box encompassing all motion
                            min_x = min(box[0] for box in qualifying_boxes)
                            min_y = min(box[1] for box in qualifying_boxes)
                            max_x = max(box[0] + box[2] for box in qualifying_boxes)
                            max_y = max(box[1] + box[3] for box in qualifying_boxes)
                            
                            koordinat_kotak.append({
                                "confidence": 1.0,
                                "posisi": [
                                    round(float(min_x / orig_w), 4),
                                    round(float(min_y / orig_h), 4),
                                    round(float(max_x / orig_w), 4),
                                    round(float(max_y / orig_h), 4)
                                ]
                            })
                        else:
                            # Separate bounding boxes
                            for (x, y, w, h, area) in qualifying_boxes:
                                koordinat_kotak.append({
                                    "confidence": 1.0,
                                    "posisi": [
                                        round(float(x / orig_w), 4),
                                        round(float(y / orig_h), 4),
                                        round(float((x + w) / orig_w), 4),
                                        round(float((y + h) / orig_h), 4)
                                    ]
                                })

                    ada_orang = len(koordinat_kotak) > 0
                    jumlah_orang = len(koordinat_kotak)

                    if annotate:
                        # Draw bounding boxes on image
                        for box in koordinat_kotak:
                            pos = box["posisi"]
                            x1 = int(pos[0] * orig_w)
                            y1 = int(pos[1] * orig_h)
                            x2 = int(pos[2] * orig_w)
                            y2 = int(pos[3] * orig_h)
                            cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)

                        # Encode JPEG annotated image
                        _, buffer = cv2.imencode('.jpg', img)
                        img_bytes_out = buffer.tobytes()

                        # Construct response payload
                        metadata = {
                            "status": "success",
                            "pesan": "Gerakan terdeteksi!" if ada_orang else "Aman, tidak ada gerakan.",
                            "ada_orang": ada_orang,
                            "jumlah_orang": jumlah_orang,
                            "koordinat_kotak": koordinat_kotak
                        }
                        metadata_bytes = json.dumps(metadata).encode('utf-8')
                        json_len = len(metadata_bytes)

                        # Header: req_id (4 bytes) + json_len (4 bytes)
                        header = req_id.to_bytes(4, byteorder='big') + json_len.to_bytes(4, byteorder='big')
                        response_bytes = header + metadata_bytes + img_bytes_out
                        await websocket.send(response_bytes)

                        del buffer
                    else:
                        # Non-annotated: send standard JSON response string
                        response = {
                            "requestId": req_id,
                            "status": "success",
                            "pesan": "Gerakan terdeteksi!" if ada_orang else "Aman, tidak ada gerakan.",
                            "ada_orang": ada_orang,
                            "jumlah_orang": jumlah_orang,
                            "koordinat_kotak": koordinat_kotak
                        }
                        await websocket.send(json.dumps(response))

                    del nparr, img, gray, gray_blurred, diff, thresh, contours
                    gc.collect()

                except Exception as e:
                    print(f"[ERROR] Gagal memproses binary request: {e}")
                    try:
                        await websocket.send(json.dumps({
                            "requestId": req_id if 'req_id' in locals() else None,
                            "status": "error",
                            "message": f"Server error: {str(e)}"
                        }))
                    except:
                        pass
            else:
                print("[WARNING] Menerima pesan teks tidak terduga, menolak request.")
                await websocket.send(json.dumps({
                    "status": "error",
                    "message": "Pixel Server strictly operates on high-performance raw binary frames."
                }))

    except websockets.exceptions.ConnectionClosed:
        print(f"[INFO] Connection closed from server.")

async def main():
    # Connects to Node.js backend server on port 5001 for Pixel Comparison
    uri = f"ws://{config.BACKEND_HOST}:5001"
    print(f"\n[INFO] Menghubungkan ke Node.js backend pixel server di {uri}...")
    while True:
        try:
            async with websockets.connect(uri, max_size=config.MAX_WS_SIZE) as websocket:
                print("[INFO] Terhubung ke Node.js backend pixel server successfully.")
                await handle_client(websocket)
        except Exception as e:
            print(f"[WARNING] Koneksi terputus/gagal: {e}. Menghubungkan kembali dalam 3 detik...")
            await asyncio.sleep(3)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("[INFO] Server dihentikan.")
