# Configuration settings for the human detection subsystem

MODEL_PATH = "yolo26n_float32.tflite"

# Detection and NMS Hyperparameters
CONF_THRESHOLD = 0.50
NMS_THRESHOLD = 0.95

# Performance and Hardware
NUM_THREADS = 2

# WebSocket Client Configuration (Target Backend)
BACKEND_HOST = "localhost"
BACKEND_PORT = 5000
MAX_WS_SIZE = 20 * 1024 * 1024  # 20 MB

# Camera Detection Mode ("AI" or "Pixel")
CAMERA_DETECTION_MODE = "AI"

# Pixel Comparison Settings
PIXEL_MOTION_SENSITIVITY = 10
PIXEL_MOTION_MIN_AREA = 10.0
PIXEL_MOTION_MODE = 0  # 0: Static Reference, 1: Frame-to-Frame
PIXEL_MOTION_MERGE = False
PIXEL_MOTION_RESET_INTERVAL = 1
PIXEL_MOTION_CLUSTER_DIST = 50
PIXEL_MOTION_MIN_SIZE = 10


