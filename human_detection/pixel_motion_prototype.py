#!/usr/bin/env python3
"""
Pixel Comparison Motion Detection Prototype
Accesses the laptop webcam, processes video frames in real-time,
and visualizes pixel-differencing motion detection with interactive controls.
"""

import cv2
import time
import sys

def nothing(x):
    pass

def main():
    # Initialize camera. Device 0 is usually the default laptop webcam.
    print("[INFO] Initializing webcam...")
    cap = cv2.VideoCapture(0)

    # Check if the webcam is accessible
    if not cap.isOpened():
        print("[ERROR] Could not open webcam.")
        print("[TIP] Ensure no other application is using the camera and your user has permission to access it.")
        print("[TIP] If you have multiple video devices, try changing cap = cv2.VideoCapture(0) to cap = cv2.VideoCapture(1) inside the script.")
        sys.exit(1)

    # Create windows for visualization
    window_main = "Pixel Motion Detector (Live)"
    window_delta = "Threshold Delta (Binary Mask)"
    
    cv2.namedWindow(window_main, cv2.WINDOW_NORMAL)
    cv2.namedWindow(window_delta, cv2.WINDOW_NORMAL)

    # Set up GUI trackbars for real-time parameter tuning
    # 1. Threshold value: minimum pixel brightness change to count as motion
    cv2.createTrackbar("Threshold", window_main, 25, 255, nothing)
    # 2. Minimum Area: minimum pixel contour size to trigger detection
    cv2.createTrackbar("Min Area", window_main, 1000, 20000, nothing)
    # 3. Detection Mode:
    #    0 = Static Reference (Compare against a saved snapshot of background)
    #    1 = Frame-to-Frame (Compare against the immediately preceding frame)
    cv2.createTrackbar("Mode (0:Static, 1:F2F)", window_main, 0, 1, nothing)
    # 4. Box Merging Toggle:
    #    0 = Off (Display individual bounding boxes)
    #    1 = On (Merge all active bounding boxes into a single combined outer box)
    cv2.createTrackbar("Merge (0:Off, 1:On)", window_main, 0, 1, nothing)

    static_back = None
    prev_frame = None
    prev_centroid_x = None
    motion_direction = "NONE"

    print("\n" + "="*50)
    print(" PIXEL COMPARISON MOTION DETECTOR RUNNING")
    print("="*50)
    print(" Controls:")
    print("   - Press 'r' to recalibrate/reset the static background reference.")
    print("   - Adjust the trackbar sliders to change sensitivity and area threshold.")
    print("   - Press 'q' or 'ESC' to exit the application.")
    print("="*50 + "\n")

    # Give webcam time to warm up and auto-adjust exposure
    time.sleep(1.0)

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[WARNING] Failed to grab frame from webcam. Retrying...")
            continue

        # Create copies/clones for processing and display
        display_frame = frame.copy()
        
        # 1. Convert frame to Grayscale and apply Gaussian Blur to smooth out high-frequency noise
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray_blurred = cv2.GaussianBlur(gray, (21, 21), 0)

        # Read current control parameter values from trackbars
        thresh_val = cv2.getTrackbarPos("Threshold", window_main)
        min_area = cv2.getTrackbarPos("Min Area", window_main)
        mode = cv2.getTrackbarPos("Mode (0:Static, 1:F2F)", window_main)
        merge_mode = cv2.getTrackbarPos("Merge (0:Off, 1:On)", window_main)

        # Enforce minimum positive values to avoid division/processing errors
        if thresh_val < 1:
            thresh_val = 1
        if min_area < 10:
            min_area = 10

        # 2. Compute absolute difference between the current frame and reference frame
        if mode == 0:
            # Mode 0: Compare against a static background reference
            if static_back is None:
                static_back = gray_blurred
                print("[INFO] Static background reference calibrated.")
            diff_frame = cv2.absdiff(static_back, gray_blurred)
        else:
            # Mode 1: Compare against the previous frame (high temporal movement sensitivity)
            if prev_frame is None:
                prev_frame = gray_blurred
            diff_frame = cv2.absdiff(prev_frame, gray_blurred)

        # Update previous frame for next loop iteration
        prev_frame = gray_blurred

        # 3. Apply thresholding to obtain a clean binary mask of changed pixels
        _, thresh_frame = cv2.threshold(diff_frame, thresh_val, 255, cv2.THRESH_BINARY)

        # 4. Dilate the thresholded image to fill in holes and join adjacent motion blobs
        thresh_frame = cv2.dilate(thresh_frame, None, iterations=2)

        # 5. Find contours of the moving areas
        contours, _ = cv2.findContours(thresh_frame.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        motion_detected = False

        # 6. Filter contours based on minimum area size
        qualifying_boxes = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < min_area:
                continue

            (x, y, w, h) = cv2.boundingRect(contour)
            qualifying_boxes.append((x, y, w, h, area))

        if len(qualifying_boxes) > 0:
            # A contour has met our area criteria -> Motion is detected!
            motion_detected = True

            # Calculate centroid of active motion region
            min_x = min(box[0] for box in qualifying_boxes)
            max_x = max(box[0] + box[2] for box in qualifying_boxes)
            current_center_x = (min_x + max_x) / 2

            if prev_centroid_x is not None:
                dx = current_center_x - prev_centroid_x
                if dx > 4:
                    motion_direction = "RIGHT"
                elif dx < -4:
                    motion_direction = "LEFT"
            prev_centroid_x = current_center_x

            if merge_mode == 1:
                # Merge all bounding boxes into one single outer bounding box
                min_y = min(box[1] for box in qualifying_boxes)
                max_y = max(box[1] + box[3] for box in qualifying_boxes)
                
                # Draw single merged bounding box
                cv2.rectangle(display_frame, (min_x, min_y), (max_x, max_y), (0, 255, 0), 2)
                
                # Print area/label information on the merged box
                total_area = sum(box[4] for box in qualifying_boxes)
                cv2.putText(display_frame, f"Motion Region (Area: {int(total_area)})", (min_x, min_y - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1)
            else:
                # Draw each individual bounding box
                for (x, y, w, h, area) in qualifying_boxes:
                    cv2.rectangle(display_frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
                    cv2.putText(display_frame, f"Area: {int(area)}", (x, y - 5),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
        else:
            prev_centroid_x = None
            motion_direction = "NONE"

        # 7. Render status overlays and slider labels on the main video window
        status_text = "STATUS: MOTION DETECTED" if motion_detected else "STATUS: STANDBY"
        status_color = (0, 0, 255) if motion_detected else (0, 255, 0)
        
        # Create dark semi-transparent panel for labels (top-left)
        overlay = display_frame.copy()
        cv2.rectangle(overlay, (5, 5), (320, 150), (15, 23, 42), -1) # Extended dark background for 6 lines
        cv2.addWeighted(overlay, 0.65, display_frame, 0.35, 0, display_frame)

        # Draw status and slider labels inside the panel
        cv2.putText(display_frame, status_text, (15, 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, status_color, 2)
        cv2.putText(display_frame, f"Threshold (Sensitivity): {thresh_val}", (15, 53),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.putText(display_frame, f"Min Area (Blob Size): {min_area} px", (15, 73),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        mode_text = "Static Reference" if mode == 0 else "Frame-to-Frame"
        cv2.putText(display_frame, f"Mode: {mode_text}", (15, 93),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        merge_text = "On (Single Blob)" if merge_mode == 1 else "Off (Individual)"
        cv2.putText(display_frame, f"Merge Boxes: {merge_text}", (15, 113),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        # Draw motion direction label inside the panel
        if motion_direction == "RIGHT":
            dir_label = "----> RIGHT"
        elif motion_direction == "LEFT":
            dir_label = "<---- LEFT"
        else:
            dir_label = "NONE"
        cv2.putText(display_frame, f"Direction: {dir_label}", (15, 133),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        cv2.putText(display_frame, "Press 'r' to recalibrate | 'q' to quit", (10, display_frame.shape[0] - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1)

        # Show frames in their respective windows
        cv2.imshow(window_main, display_frame)
        cv2.imshow(window_delta, thresh_frame)

        # Handle user keyboard inputs
        key = cv2.waitKey(1) & 0xFF
        
        # 'q' or ESC (27) to quit
        if key == ord('q') or key == 27:
            print("[INFO] Exiting prototype...")
            break
            
        # 'r' to reset / recalibrate background reference
        elif key == ord('r'):
            static_back = gray_blurred
            prev_frame = gray_blurred
            print("[INFO] Recalibrated background reference.")

    # Clean up and release camera resources
    cap.release()
    cv2.destroyAllWindows()
    print("[INFO] Webcam released and windows closed. Goodbye!")

if __name__ == "__main__":
    main()
