#include <WiFi.h>
#include <WebSocketsClient.h>
#include <HTTPClient.h>
#include "esp_camera.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include <WiFiManager.h>
#include <WiFiUdp.h>
#include <Preferences.h>

// AI Thinker ESP32-CAM Pinout
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define V_SYNC_GPIO_NUM   25
#define H_REF_GPIO_NUM    23
#define P_CLK_GPIO_NUM    22

// Servo Configuration
#define SERVO_PIN 12
#define SERVO_LEDC_RES 13 // 13-bit resolution (8192)
#define SERVO_LEDC_FREQ 50 // 50Hz for standard servos

// Servo Positions
uint8_t SERVO_POS_LEFT = 155;
uint8_t SERVO_POS_MIDDLE = 90;
uint8_t SERVO_POS_RIGHT = 0;
uint8_t SERVO_POS_DEFAULT = 90;

// WiFi credentials managed by WiFiManager

// Security API Key
const char* apiKey = "momo_gemoy_api_key_123";

const uint8_t left_pir_pin = 13;
const uint8_t middle_pir_pin = 15;
const uint8_t right_pir_pin = 14;

volatile bool pendingLeftMotion = false;
volatile bool pendingMiddleMotion = false;
volatile bool pendingRightMotion = false;

// Flash LED GPIO (AI Thinker ESP32-CAM: GPIO 4)
#define FLASH_GPIO_NUM 4

// LED Notification states
enum LedNotificationState {
  LED_STATE_OFF = 0,
  LED_STATE_CONNECTING_WIFI = 1,
  LED_STATE_FINDING_SERVER = 2
};
volatile int ledNotificationState = LED_STATE_OFF;

// Flag untuk on-demand capture via Telegram
String pendingCaptureLabel = "";

// Flag untuk servo control
volatile int pendingServoAngle = -1;

unsigned long servoReturnTime = 0;
bool isServoWaitingToReturn = false;

volatile bool pendingConnectionRestart = false;

volatile int currentServoAngle = 90;
volatile int targetServoAngle = 90;
volatile int sweepMode = 0; // 0 = off, 1 = continuous, 2 = once
volatile bool sweepDirectionUp = true;
volatile bool sweepReturning = false;
volatile bool pendingSweepStopReport = false;
TaskHandle_t servoTaskHandle = NULL;

// Global camera config agar bisa dipakai ulang saat reinit
camera_config_t app_cam_config;

// Camera Configurator Parameters (defaults matching backend startup)
String cam_resolution = "HVGA";
int cam_quality = 12;
int cam_brightness = 0;
int cam_contrast = 0;
int cam_saturation = 0;
bool cam_awb = true;
bool cam_aec = true;
bool cam_agc = true;
bool cam_hmirror = false;
bool cam_vflip = false;
String cam_specialEffect = "None";
int cam_xclk = 8000000;
bool cam_flashOnCapture = true;
int cam_flashIntensity = 0;

// PIR sensor settings managed by backend system settings
bool cam_pirEnabled = true;
int cam_pirCooldown = 30;
unsigned long lastPirTriggerTime = 0;

void applyCameraConfig() {
  sensor_t * s = esp_camera_sensor_get();
  if (!s) return;

  // 1. Resolution
  framesize_t framesize = FRAMESIZE_HVGA;
  if (cam_resolution == "UXGA") framesize = FRAMESIZE_UXGA;
  else if (cam_resolution == "SVGA") framesize = FRAMESIZE_SVGA;
  else if (cam_resolution == "VGA") framesize = FRAMESIZE_VGA;
  else if (cam_resolution == "CIF") framesize = FRAMESIZE_CIF;
  else if (cam_resolution == "HVGA") framesize = FRAMESIZE_HVGA;
  else if (cam_resolution == "QVGA") framesize = FRAMESIZE_QVGA;
  else if (cam_resolution == "HQVGA") framesize = FRAMESIZE_HQVGA;
  else if (cam_resolution == "QCIF") framesize = FRAMESIZE_QCIF;
  else if (cam_resolution == "QQVGA") framesize = FRAMESIZE_QQVGA;
  else if (cam_resolution == "96X96") framesize = FRAMESIZE_96X96;
  s->set_framesize(s, framesize);

  // 2. Quality
  s->set_quality(s, cam_quality);

  // 3. Image Tuning
  s->set_brightness(s, cam_brightness);
  s->set_contrast(s, cam_contrast);
  s->set_saturation(s, cam_saturation);

  // 4. AWB, AEC, AGC
  s->set_whitebal(s, cam_awb ? 1 : 0);
  s->set_awb_gain(s, cam_awb ? 1 : 0);
  s->set_exposure_ctrl(s, cam_aec ? 1 : 0);
  s->set_gain_ctrl(s, cam_agc ? 1 : 0);

  // 5. Mirror & Flip
  s->set_hmirror(s, cam_hmirror ? 1 : 0);
  s->set_vflip(s, cam_vflip ? 1 : 0);

  // 6. Special Effect
  int effectVal = 0;
  if (cam_specialEffect == "Negative") effectVal = 1;
  else if (cam_specialEffect == "Grayscale") effectVal = 2;
  else if (cam_specialEffect == "Red Tint") effectVal = 3;
  else if (cam_specialEffect == "Green Tint") effectVal = 4;
  else if (cam_specialEffect == "Blue Tint") effectVal = 5;
  else if (cam_specialEffect == "Sepia") effectVal = 6;
  s->set_special_effect(s, effectVal);

  // 7. XCLK (set via LEDC timer, value in MHz)
  s->set_xclk(s, LEDC_TIMER_0, cam_xclk / 1000000);

  Serial.println("[CAM] Camera configurations successfully applied to sensor.");
}


// Map angle (0-180) to Duty Cycle (13-bit: 0-8191)
// Standard Servo: 500us (0 deg) to 2400us (180 deg) at 20ms period (50Hz)
// 500us / 20000us * 8192 = 205
// 2400us / 20000us * 8192 = 983
void setServoAngle(uint8_t angle) {
  if (angle > 180) angle = 180;
  
  // Invert servo PWM control: 0 maps to 983, 180 maps to 205
  int duty = map(angle, 0, 180, 983, 205);
  ledcWrite(SERVO_PIN, duty); // Use PIN directly in Core 3.x
  Serial.printf("[SERVO] Angle set to %d (Duty: %d)\n", angle, duty);
}

void servoTask(void * pvParameters) {
  for (;;) {
    int mode = __atomic_load_n(&sweepMode, __ATOMIC_SEQ_CST);
    bool returning = __atomic_load_n(&sweepReturning, __ATOMIC_SEQ_CST);
    int target = __atomic_load_n(&targetServoAngle, __ATOMIC_SEQ_CST);
    int current = __atomic_load_n(&currentServoAngle, __ATOMIC_SEQ_CST);

    if (mode == 1 || mode == 2 || returning) {
      int nextAngle = current;
      
      if (returning) {
        // Move towards default angle (SERVO_POS_DEFAULT) at 1 degree step
        if (current < SERVO_POS_DEFAULT) {
          nextAngle += 1;
        } else if (current > SERVO_POS_DEFAULT) {
          nextAngle -= 1;
        }
        
        if (nextAngle == SERVO_POS_DEFAULT) {
          __atomic_store_n(&sweepMode, 0, __ATOMIC_SEQ_CST);
          __atomic_store_n(&targetServoAngle, SERVO_POS_DEFAULT, __ATOMIC_SEQ_CST);
          __atomic_store_n(&sweepReturning, false, __ATOMIC_SEQ_CST);
          __atomic_store_n(&sweepDirectionUp, true, __ATOMIC_SEQ_CST);
          __atomic_store_n(&pendingSweepStopReport, true, __ATOMIC_SEQ_CST);
        }
      } else {
        // Normal active sweep (continuous or once) at 1 degree step
        bool dirUp = __atomic_load_n(&sweepDirectionUp, __ATOMIC_SEQ_CST);
        if (dirUp) {
          nextAngle += 1;
          if (nextAngle >= 180) {
            nextAngle = 180;
            __atomic_store_n(&sweepDirectionUp, false, __ATOMIC_SEQ_CST);
          }
        } else {
          nextAngle -= 1;
          if (nextAngle <= 0) {
            nextAngle = 0;
            if (mode == 2) {
              // Start returning phase at 1 degree step
              __atomic_store_n(&sweepReturning, true, __ATOMIC_SEQ_CST);
              __atomic_store_n(&sweepDirectionUp, true, __ATOMIC_SEQ_CST); // to pan back up
            } else {
              // Continuous: wrap back to up direction
              __atomic_store_n(&sweepDirectionUp, true, __ATOMIC_SEQ_CST);
            }
          }
        }
      }

      __atomic_store_n(&currentServoAngle, nextAngle, __ATOMIC_SEQ_CST);
      setServoAngle(nextAngle);
      
      // Keep target synchronized to prevent snap-back on stop (except when returning is active)
      if (__atomic_load_n(&sweepMode, __ATOMIC_SEQ_CST) > 0 && !__atomic_load_n(&sweepReturning, __ATOMIC_SEQ_CST)) {
        __atomic_store_n(&targetServoAngle, nextAngle, __ATOMIC_SEQ_CST);
      }

      vTaskDelay(pdMS_TO_TICKS(50));
    } else if (current != target) {
      int diff = target - current;
      int nextAngle = current;
      if (abs(diff) <= 5) {
        nextAngle = target;
      } else {
        if (diff > 0) {
          nextAngle += 5;
        } else {
          nextAngle -= 5;
        }
      }

      __atomic_store_n(&currentServoAngle, nextAngle, __ATOMIC_SEQ_CST);
      setServoAngle(nextAngle);

      vTaskDelay(pdMS_TO_TICKS(50));
    } else {
      // Suspend itself to save CPU cycles when target is reached
      vTaskSuspend(NULL);
    }
  }
}

void setTargetAngle(int angle) {
  if (angle < 0) angle = 0;
  if (angle > 180) angle = 180;

  __atomic_store_n(&targetServoAngle, angle, __ATOMIC_SEQ_CST);

  if (servoTaskHandle != NULL) {
    vTaskResume(servoTaskHandle);
  }
}

void ledTask(void * pvParameters) {
  int lastWrittenState = -1;
  for (;;) {
    int state = __atomic_load_n(&ledNotificationState, __ATOMIC_SEQ_CST);
    if (state == 1) {
      lastWrittenState = 1;
      // 1 slow blink: 1000ms ON (3% PWM), 1000ms OFF
      ledcWrite(FLASH_GPIO_NUM, 8);
      for (int i = 0; i < 10; i++) {
        vTaskDelay(pdMS_TO_TICKS(100));
        if (__atomic_load_n(&ledNotificationState, __ATOMIC_SEQ_CST) != 1) break;
      }
      state = __atomic_load_n(&ledNotificationState, __ATOMIC_SEQ_CST);
      ledcWrite(FLASH_GPIO_NUM, 0);
      if (state == 1) {
        for (int i = 0; i < 10; i++) {
          vTaskDelay(pdMS_TO_TICKS(100));
          if (__atomic_load_n(&ledNotificationState, __ATOMIC_SEQ_CST) != 1) break;
        }
      }
    } else if (state == 2) {
      lastWrittenState = 2;
      // 2 fast blink: ON 200ms (3% PWM), OFF 200ms, ON 200ms, OFF 200ms, Pause 1000ms
      ledcWrite(FLASH_GPIO_NUM, 8);
      for (int i = 0; i < 2; i++) {
        vTaskDelay(pdMS_TO_TICKS(100));
        if (__atomic_load_n(&ledNotificationState, __ATOMIC_SEQ_CST) != 2) break;
      }
      ledcWrite(FLASH_GPIO_NUM, 0);
      for (int i = 0; i < 2; i++) {
        vTaskDelay(pdMS_TO_TICKS(100));
        if (__atomic_load_n(&ledNotificationState, __ATOMIC_SEQ_CST) != 2) break;
      }
      if (__atomic_load_n(&ledNotificationState, __ATOMIC_SEQ_CST) == 2) {
        ledcWrite(FLASH_GPIO_NUM, 8);
        for (int i = 0; i < 2; i++) {
          vTaskDelay(pdMS_TO_TICKS(100));
          if (__atomic_load_n(&ledNotificationState, __ATOMIC_SEQ_CST) != 2) break;
        }
        ledcWrite(FLASH_GPIO_NUM, 0);
        for (int i = 0; i < 10; i++) {
          vTaskDelay(pdMS_TO_TICKS(100));
          if (__atomic_load_n(&ledNotificationState, __ATOMIC_SEQ_CST) != 2) break;
        }
      } else {
        ledcWrite(FLASH_GPIO_NUM, 0);
      }
    } else {
      if (lastWrittenState != 0) {
        ledcWrite(FLASH_GPIO_NUM, 0);
        lastWrittenState = 0;
      }
      vTaskDelay(pdMS_TO_TICKS(100));
    }
  }
}

WebSocketsClient webSocket;
bool isConnected = false;
unsigned long lastWebSocketConnectedTime = 0;
unsigned long lastSignalSent = 0;
unsigned long lastHeartbeatSent = 0;
unsigned long lastWsActivity = 0;
unsigned long lastForceReconnectTime = 0;
IPAddress serverIP;
unsigned long lastDiscoveryQuery = 0;
String globalCustomSubnet = "192.168.1";
WiFiUDP udp;
bool udpStreamEnabled = false;
bool udpInitialized = false;

// UDP transmission control
const unsigned long UDP_TIMEOUT_MS = 2000;
const unsigned long WS_LIVENESS_TIMEOUT_MS = 45000;

uint8_t* wsPacketBuffer = nullptr;

void markWebSocketAlive() {
  lastWsActivity = millis();
}

void forceWebSocketReconnect(const char* reason) {
  if (!isConnected) return;
  Serial.printf("[WSc] Connection considered stale (%s). Forcing reconnect...\n", reason);
  isConnected = false;
  lastWsActivity = 0;
  udpInitialized = false;
  webSocket.disconnect();
  lastDiscoveryQuery = 0;
  lastForceReconnectTime = millis(); // Prevent immediate reconnect (let close propagate)
}

bool sendWsText(String message, const char* context) {
  bool sent = webSocket.sendTXT(message);
  if (!sent) {
    Serial.printf("[WSc] Failed to send text message (%s).\n", context);
    forceWebSocketReconnect(context);
  }
  return sent;
}

bool sendWsBinary(uint8_t* payload, size_t length, const char* context) {
  bool sent = webSocket.sendBIN(payload, length);
  if (!sent) {
    Serial.printf("[WSc] Failed to send binary chunk (%s).\n", context);
    forceWebSocketReconnect(context);
  }
  return sent;
}


void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WSc] Disconnected!");
      isConnected = false;
      lastWsActivity = 0;
      setTargetAngle(SERVO_POS_DEFAULT);
      isServoWaitingToReturn = false;
      udpInitialized = false;
      __atomic_store_n(&ledNotificationState, LED_STATE_FINDING_SERVER, __ATOMIC_SEQ_CST);
      break;
    case WStype_CONNECTED:
      Serial.printf("[WSc] Connected to url: %s\n", payload);
      isConnected = true;
      markWebSocketAlive();
      __atomic_store_n(&ledNotificationState, LED_STATE_OFF, __ATOMIC_SEQ_CST);
      break;
    case WStype_TEXT:
      Serial.printf("[WSc] get text: %s\n", payload);
      markWebSocketAlive();
      {
        String cmd = String((char*)payload);
        // Set flag saja, JANGAN panggil captureAndUpload langsung dari sini!
        // Memanggil fungsi berat di dalam WS callback akan memblokir library
        // dan menyebabkan koneksi disconnect.
        if (cmd.indexOf("\"heartbeat_ping\"") >= 0) {
          // App-layer keepalive from backend — reply immediately
          webSocket.sendTXT("{\"type\":\"heartbeat_pong\"}");
        } else if (cmd.indexOf("\"capture_request\"") >= 0) {
          Serial.println("[WSc] On-demand capture queued.");
          pendingCaptureLabel = "capture";
        } else if (cmd.indexOf("\"cancel_return\"") >= 0) {
          isServoWaitingToReturn = false;
          Serial.println("[WSc] Cancel return command received.");
        } else if (cmd.indexOf("\"servo_control\"") >= 0) {
          int valueIdx = cmd.indexOf("\"value\":") + 8;
          int endIdx = cmd.indexOf("}", valueIdx);
          if (valueIdx > 8 && endIdx > valueIdx) {
            String valStr = cmd.substring(valueIdx, endIdx);
            valStr.trim();
            pendingServoAngle = valStr.toInt();
            sweepMode = 0; // Disable sweep on manual control
            sweepReturning = false;
            Serial.printf("[WSc] Servo angle received: %d\n", pendingServoAngle);
          }
        } else if (cmd.indexOf("\"sweep_control\"") >= 0) {
          int valueIdx = cmd.indexOf("\"value\":");
          if (valueIdx != -1) {
            String valStr = cmd.substring(valueIdx + 8);
            valStr.trim();
            if (valStr.indexOf("\"continuous\"") >= 0) {
              sweepMode = 1;
              sweepReturning = false;
              if (servoTaskHandle != NULL) {
                vTaskResume(servoTaskHandle);
              }
              Serial.println("[WSc] Sweep mode: CONTINUOUS");
            } else if (valStr.indexOf("\"once\"") >= 0) {
              sweepMode = 2;
              sweepDirectionUp = true;
              sweepReturning = false;
              if (servoTaskHandle != NULL) {
                vTaskResume(servoTaskHandle);
              }
              Serial.println("[WSc] Sweep mode: ONCE (SWEEP ONE CYCLE)");
            } else {
              sweepMode = 0;
              sweepReturning = false;
              Serial.println("[WSc] Sweep mode: OFF");
            }
          }
        } else if (cmd.indexOf("\"servo_config_update\"") >= 0) {
           int leftIdx = cmd.indexOf("\"leftPirAngle\":");
           int middleIdx = cmd.indexOf("\"middlePirAngle\":");
           int rightIdx = cmd.indexOf("\"rightPirAngle\":");
           int defaultIdx = cmd.indexOf("\"defaultAngle\":");
           
           if (leftIdx != -1) SERVO_POS_LEFT = cmd.substring(leftIdx + 15).toInt();
           if (middleIdx != -1) SERVO_POS_MIDDLE = cmd.substring(middleIdx + 17).toInt();
           if (rightIdx != -1) SERVO_POS_RIGHT = cmd.substring(rightIdx + 16).toInt();
           if (defaultIdx != -1) SERVO_POS_DEFAULT = cmd.substring(defaultIdx + 15).toInt();
           
           Serial.printf("[WSc] Servo config updated via WS: L=%d, M=%d, R=%d, D=%d\n", SERVO_POS_LEFT, SERVO_POS_MIDDLE, SERVO_POS_RIGHT, SERVO_POS_DEFAULT);
           // Set the servo to the new default immediately (ledcWrite is fast and non-blocking)
           setTargetAngle(SERVO_POS_DEFAULT);
        } else if (cmd.indexOf("\"camera_config_update\"") >= 0) {
           int resIdx = cmd.indexOf("\"resolution\":\"");
           if (resIdx != -1) {
             int start = resIdx + 14;
             int end = cmd.indexOf("\"", start);
             if (end != -1) cam_resolution = cmd.substring(start, end);
           }

           int qualIdx = cmd.indexOf("\"quality\":");
           if (qualIdx != -1) {
             int start = qualIdx + 10;
             int end = cmd.indexOf(",", start);
             if (end == -1) end = cmd.indexOf("}", start);
             if (end != -1) cam_quality = cmd.substring(start, end).toInt();
           }

           int brightIdx = cmd.indexOf("\"brightness\":");
           if (brightIdx != -1) {
             int start = brightIdx + 13;
             int end = cmd.indexOf(",", start);
             if (end == -1) end = cmd.indexOf("}", start);
             if (end != -1) cam_brightness = cmd.substring(start, end).toInt();
           }

           int contrastIdx = cmd.indexOf("\"contrast\":");
           if (contrastIdx != -1) {
             int start = contrastIdx + 11;
             int end = cmd.indexOf(",", start);
             if (end == -1) end = cmd.indexOf("}", start);
             if (end != -1) cam_contrast = cmd.substring(start, end).toInt();
           }

           int satIdx = cmd.indexOf("\"saturation\":");
           if (satIdx != -1) {
             int start = satIdx + 13;
             int end = cmd.indexOf(",", start);
             if (end == -1) end = cmd.indexOf("}", start);
             if (end != -1) cam_saturation = cmd.substring(start, end).toInt();
           }

           int awbIdx = cmd.indexOf("\"awb\":");
           if (awbIdx != -1) {
             int start = awbIdx + 6;
             int end = cmd.indexOf(",", start);
             if (end == -1) end = cmd.indexOf("}", start);
             if (end != -1) cam_awb = (cmd.substring(start, end).indexOf("true") != -1);
           }

           int aecIdx = cmd.indexOf("\"aec\":");
           if (aecIdx != -1) {
             int start = aecIdx + 6;
             int end = cmd.indexOf(",", start);
             if (end == -1) end = cmd.indexOf("}", start);
             if (end != -1) cam_aec = (cmd.substring(start, end).indexOf("true") != -1);
           }

           int agcIdx = cmd.indexOf("\"agc\":");
           if (agcIdx != -1) {
             int start = agcIdx + 6;
             int end = cmd.indexOf(",", start);
             if (end == -1) end = cmd.indexOf("}", start);
             if (end != -1) cam_agc = (cmd.substring(start, end).indexOf("true") != -1);
           }

           int hmirrorIdx = cmd.indexOf("\"hmirror\":");
           if (hmirrorIdx != -1) {
             int start = hmirrorIdx + 10;
             int end = cmd.indexOf(",", start);
             if (end == -1) end = cmd.indexOf("}", start);
             if (end != -1) cam_hmirror = (cmd.substring(start, end).indexOf("true") != -1);
           }

           int vflipIdx = cmd.indexOf("\"vflip\":");
           if (vflipIdx != -1) {
             int start = vflipIdx + 8;
             int end = cmd.indexOf(",", start);
             if (end == -1) end = cmd.indexOf("}", start);
             if (end != -1) cam_vflip = (cmd.substring(start, end).indexOf("true") != -1);
           }

           int effectIdx = cmd.indexOf("\"specialEffect\":\"");
           if (effectIdx != -1) {
             int start = effectIdx + 17;
             int end = cmd.indexOf("\"", start);
             if (end != -1) cam_specialEffect = cmd.substring(start, end);
           }

           int xclkIdx = cmd.indexOf("\"xclk\":");
           if (xclkIdx != -1) {
             int start = xclkIdx + 7;
             int end = cmd.indexOf(",", start);
             if (end == -1) end = cmd.indexOf("}", start);
             if (end != -1) cam_xclk = cmd.substring(start, end).toInt();
           }

           int flashIdx = cmd.indexOf("\"flashOnCapture\":");
           if (flashIdx != -1) {
             int start = flashIdx + 17;
             int end = cmd.indexOf(",", start);
             if (end == -1) end = cmd.indexOf("}", start);
             if (end != -1) cam_flashOnCapture = (cmd.substring(start, end).indexOf("true") != -1);
           }

            int intensityIdx = cmd.indexOf("\"flashIntensity\":");
            if (intensityIdx != -1) {
              int start = intensityIdx + 17;
              int end = cmd.indexOf(",", start);
              if (end == -1) end = cmd.indexOf("}", start);
              if (end != -1) {
                 cam_flashIntensity = cmd.substring(start, end).toInt();
                 ledcWrite(FLASH_GPIO_NUM, cam_flashIntensity);
                 Serial.printf("[Flash] Intensity updated to %d\n", cam_flashIntensity);
              }
            }

           Serial.printf("[WSc] Camera config updated: Res=%s, Qual=%d, Bright=%d, Contrast=%d, Sat=%d, AWB=%d, AEC=%d, AGC=%d, Mirror=%d, Flip=%d, Effect=%s, XCLK=%d, Flash=%d\n",
                         cam_resolution.c_str(), cam_quality, cam_brightness, cam_contrast, cam_saturation, cam_awb, cam_aec, cam_agc, cam_hmirror, cam_vflip, cam_specialEffect.c_str(), cam_xclk, cam_flashOnCapture);

           // XCLK is changed at runtime via s->set_xclk() inside applyCameraConfig()

           applyCameraConfig();
          } else if (cmd.indexOf("\"take_photo\"") >= 0) {
             int sensorIdx = cmd.indexOf("\"sensor\":\"");
             if (sensorIdx != -1) {
               int start = sensorIdx + 10;
               int end = cmd.indexOf("\"", start);
               if (end != -1) {
                 pendingCaptureLabel = cmd.substring(start, end);
                 Serial.printf("[WSc] Received take_photo command for sensor: %s\n", pendingCaptureLabel.c_str());
               }
             }
          } else if (cmd.indexOf("\"system_settings_update\"") >= 0) {
            int enabledIdx = cmd.indexOf("\"pirEnabled\"");
            int cooldownIdx = cmd.indexOf("\"pirCooldown\"");
            int udpIdx = cmd.indexOf("\"udpStreamEnabled\"");
            
            if (enabledIdx != -1) {
              int colonIdx = cmd.indexOf(":", enabledIdx);
              if (colonIdx != -1) {
                int start = colonIdx + 1;
                while (start < cmd.length() && (cmd[start] == ' ' || cmd[start] == '\t' || cmd[start] == '"')) {
                  start++;
                }
                cam_pirEnabled = (cmd.substring(start, start + 4).indexOf("true") != -1);
              }
            }
            if (cooldownIdx != -1) {
              int colonIdx = cmd.indexOf(":", cooldownIdx);
              if (colonIdx != -1) {
                int start = colonIdx + 1;
                while (start < cmd.length() && (cmd[start] == ' ' || cmd[start] == '\t' || cmd[start] == '"')) {
                  start++;
                }
                int end = start;
                while (end < cmd.length() && (cmd[end] >= '0' && cmd[end] <= '9')) {
                  end++;
                }
                if (end > start) {
                  cam_pirCooldown = cmd.substring(start, end).toInt();
                }
              }
            }
            if (udpIdx != -1) {
              int colonIdx = cmd.indexOf(":", udpIdx);
              if (colonIdx != -1) {
                int start = colonIdx + 1;
                while (start < cmd.length() && (cmd[start] == ' ' || cmd[start] == '\t' || cmd[start] == '"')) {
                  start++;
                }
                bool nextUdp = (cmd.substring(start, start + 4).indexOf("true") != -1);
                 if (nextUdp != udpStreamEnabled) {
                   udpStreamEnabled = nextUdp;
                   pendingConnectionRestart = true;
                 }
              }
            }
            Serial.printf("[WSc] System settings updated: pirEnabled=%d, pirCooldown=%d, udpStreamEnabled=%d\n", cam_pirEnabled, cam_pirCooldown, udpStreamEnabled);
          }
      }
      break;
    case WStype_BIN:
      // Binary data received from server (not expected from camera usually)
      markWebSocketAlive();
      break;
    case WStype_PING:
      markWebSocketAlive();
      break;
    case WStype_PONG:
      markWebSocketAlive();
      break;
    case WStype_ERROR:
      Serial.printf("[WSc] Error: %s\n", payload);
      forceWebSocketReconnect("websocket error");
      break;
  }
}

void connectWebSocket() {
  // Get MAC address and construct connection path with query parameters
  String mac = WiFi.macAddress();
  String path = "/camera?mac=" + mac + "&apiKey=" + String(apiKey);

  // Connect to WebSocket using the resolved IP and query string path
  webSocket.disconnect();
  webSocket.begin(serverIP.toString().c_str(), 3000, path.c_str());
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  webSocket.enableHeartbeat(10000, 3000, 2);
  Serial.printf("[WSc] WebSocket initialized connecting to ws://%s:3000%s\n", serverIP.toString().c_str(), path.c_str());
}

IPAddress discoverBackendIP() {
  IPAddress foundIP;
  foundIP.fromString("0.0.0.0");
  
  WiFiUDP discUdp;
  if(discUdp.begin(3005)) {
    String localIP = WiFi.localIP().toString();
    String localSubnet = localIP.substring(0, localIP.lastIndexOf('.'));
    
    // Tier 0: Subnet Broadcast Scan
    Serial.println("[DISC] Tier 0: Scanning via Subnet Broadcast on port 3005");
    IPAddress broadcastIP;
    broadcastIP.fromString("255.255.255.255");
    discUdp.beginPacket(broadcastIP, 3005);
    discUdp.print("discovery_ping");
    discUdp.endPacket();
    
    unsigned long startBroadcastWait = millis();
    while(millis() - startBroadcastWait < 500) {
      if(discUdp.parsePacket()) {
        char packetBuffer[255];
        int len = discUdp.read(packetBuffer, 255);
        if (len > 0) packetBuffer[len] = 0;
        if(String(packetBuffer) == "discovery_ack") {
          foundIP = discUdp.remoteIP();
          Serial.printf("[DISC] Success! Backend found at %s via Tier 0 Broadcast\n", foundIP.toString().c_str());
          break;
        }
      }
      delay(10);
    }
    
    // Tier 1: Local Subnet Scan (if broadcast failed)
    if (foundIP.toString() == "0.0.0.0") {
      Serial.printf("[DISC] Tier 1: Scanning local subnet %s.x on port 3005\n", localSubnet.c_str());
    for(int i = 1; i < 255; i++) {
      IPAddress target;
      target.fromString(localSubnet + "." + String(i));
      discUdp.beginPacket(target, 3005);
      discUdp.print("discovery_ping");
      discUdp.endPacket();
      
      if(discUdp.parsePacket()) {
        char packetBuffer[255];
        int len = discUdp.read(packetBuffer, 255);
        if (len > 0) packetBuffer[len] = 0;
        if(String(packetBuffer) == "discovery_ack") {
          foundIP = discUdp.remoteIP();
          Serial.printf("[DISC] Success! Backend found at %s via Local Subnet Scan\n", foundIP.toString().c_str());
          break;
        }
      }
      delay(40); // Increased delay to 40ms to prevent ARP cache overflow
    }
    
    if (foundIP.toString() == "0.0.0.0") {
      unsigned long startWait = millis();
      while(millis() - startWait < 2000) {
        if(discUdp.parsePacket()) {
          char packetBuffer[255];
          int len = discUdp.read(packetBuffer, 255);
          if (len > 0) packetBuffer[len] = 0;
          if(String(packetBuffer) == "discovery_ack") {
            foundIP = discUdp.remoteIP();
            Serial.printf("[DISC] Success! Backend found at %s via Local Subnet Scan (Wait Phase)\n", foundIP.toString().c_str());
            break;
          }
        }
        delay(10);
      }
    }
    }
    
    // Tier 2: Custom Subnet Scan
    if (foundIP.toString() == "0.0.0.0") {
      Serial.printf("[DISC] Tier 2: Scanning custom subnet %s.x on port 3005\n", globalCustomSubnet.c_str());
      for(int i = 1; i < 255; i++) {
        IPAddress target;
        target.fromString(globalCustomSubnet + "." + String(i));
        discUdp.beginPacket(target, 3005);
        discUdp.print("discovery_ping");
        discUdp.endPacket();
        
        if(discUdp.parsePacket()) {
          char packetBuffer[255];
          int len = discUdp.read(packetBuffer, 255);
          if (len > 0) packetBuffer[len] = 0;
          if(String(packetBuffer) == "discovery_ack") {
            foundIP = discUdp.remoteIP();
            Serial.printf("[DISC] Success! Backend found at %s via Custom Subnet Scan\n", foundIP.toString().c_str());
            break;
          }
        }
        delay(40); // Increased delay to 40ms to prevent ARP cache overflow
      }
      
      if (foundIP.toString() == "0.0.0.0") {
        unsigned long startWait = millis();
        while(millis() - startWait < 2000) {
          if(discUdp.parsePacket()) {
            char packetBuffer[255];
            int len = discUdp.read(packetBuffer, 255);
            if (len > 0) packetBuffer[len] = 0;
            if(String(packetBuffer) == "discovery_ack") {
              foundIP = discUdp.remoteIP();
              Serial.printf("[DISC] Success! Backend found at %s via Custom Subnet Scan (Wait Phase)\n", foundIP.toString().c_str());
              break;
            }
          }
          delay(10);
        }
      }
    }
    discUdp.stop();
  }
  return foundIP;
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // Disable brownout detector
  
  Serial.begin(115200);
  if(psramFound())
  {
    Serial.println("psram enabled");
    wsPacketBuffer = (uint8_t*)ps_malloc(1028);
    if (wsPacketBuffer) {
      Serial.println("[MEM] WebSocket packet buffer successfully allocated in PSRAM");
    } else {
      Serial.println("[ERR] Failed to allocate WebSocket packet buffer in PSRAM");
    }
  }
  else 
  {
    Serial.println("psram are not enabled");
    wsPacketBuffer = (uint8_t*)malloc(1028);
    if (wsPacketBuffer) {
      Serial.println("[MEM] WebSocket packet buffer successfully allocated in internal heap");
    } else {
      Serial.println("[ERR] Failed to allocate WebSocket packet buffer in internal heap");
    }
  }

  // Check Pin 2 at boot to force launch the config portal
  pinMode(2, INPUT_PULLUP);
  delay(10); // Let voltage settle
  bool forceConfigPortal = (digitalRead(2) == LOW);
  if (forceConfigPortal) {
    Serial.println("[BOOT] Pin 2 held LOW. Captive portal will be forced.");
  }

  pinMode(left_pir_pin, INPUT_PULLDOWN);
  pinMode(middle_pir_pin, INPUT_PULLDOWN);
  pinMode(right_pir_pin, INPUT_PULLDOWN);
  pinMode(FLASH_GPIO_NUM, OUTPUT);
  // Gunakan PWM (LEDC) untuk meredupkan flash.
  // ESP32 Core 3.x menggunakan ledcAttach dan ledcWrite berdasarkan PIN.
  ledcAttach(FLASH_GPIO_NUM, 5000, 8); // Frekuensi 5kHz, resolusi 8-bit (0-255)
  ledcWrite(FLASH_GPIO_NUM, 0); // Default OFF sesuai permintaan user

  // Init Servo PWM (ESP32 Core 3.x API)
  ledcAttach(SERVO_PIN, SERVO_LEDC_FREQ, SERVO_LEDC_RES);
  currentServoAngle = SERVO_POS_DEFAULT;
  targetServoAngle = SERVO_POS_DEFAULT;
  setServoAngle(SERVO_POS_DEFAULT); // Start at center position

  // Create FreeRTOS task for smooth servo movement (Pinned to Core 0)
  xTaskCreatePinnedToCore(
    servoTask,
    "servoTask",
    2048,
    NULL,
    1,
    &servoTaskHandle,
    0
  );

  // Create FreeRTOS task for PIR sensor polling (Pinned to Core 0)
  xTaskCreatePinnedToCore(
    pirTask,
    "pirTask",
    2048,
    NULL,
    1,
    NULL,
    0
  );

  // Create FreeRTOS task for LED blinking notifications (Pinned to Core 0)
  xTaskCreatePinnedToCore(
    ledTask,
    "ledTask",
    2048,
    NULL,
    1,
    NULL,
    0
  );

  // Tambahkan delay 1 detik agar tegangan listrik (power supply) stabil kembali 
  // setelah servo menarik arus besar. Ini mencegah error inisialisasi I2C kamera (Error 0x106).
  delay(1000);

  // Isi pin config ke app_cam_config global (dipakai ulang saat deinit/reinit)
  app_cam_config.ledc_channel  = LEDC_CHANNEL_0;
  app_cam_config.ledc_timer    = LEDC_TIMER_0;
  app_cam_config.pin_d0        = Y2_GPIO_NUM;
  app_cam_config.pin_d1        = Y3_GPIO_NUM;
  app_cam_config.pin_d2        = Y4_GPIO_NUM;
  app_cam_config.pin_d3        = Y5_GPIO_NUM;
  app_cam_config.pin_d4        = Y6_GPIO_NUM;
  app_cam_config.pin_d5        = Y7_GPIO_NUM;
  app_cam_config.pin_d6        = Y8_GPIO_NUM;
  app_cam_config.pin_d7        = Y9_GPIO_NUM;
  app_cam_config.pin_xclk      = XCLK_GPIO_NUM;
  app_cam_config.pin_pclk      = P_CLK_GPIO_NUM;
  app_cam_config.pin_vsync     = V_SYNC_GPIO_NUM;
  app_cam_config.pin_href      = H_REF_GPIO_NUM;
  app_cam_config.pin_sscb_sda  = SIOD_GPIO_NUM;
  app_cam_config.pin_sscb_scl  = SIOC_GPIO_NUM;
  app_cam_config.pin_pwdn      = PWDN_GPIO_NUM;
  app_cam_config.pin_reset     = RESET_GPIO_NUM;
  app_cam_config.xclk_freq_hz  = 8000000; // Default 8MHz, will be overridden by backend config
  app_cam_config.pixel_format  = PIXFORMAT_JPEG;
  app_cam_config.grab_mode     = CAMERA_GRAB_LATEST;
  app_cam_config.fb_location   = CAMERA_FB_IN_PSRAM;
  app_cam_config.frame_size    = FRAMESIZE_FHD; // PRE-ALLOCATE FHD MEMORY AT BOOT
  app_cam_config.jpeg_quality  = 2; 
  app_cam_config.fb_count      = 2; 

  // Init kamera
  esp_err_t err = esp_camera_init(&app_cam_config);
  if (err != ESP_OK) {
    Serial.printf("[CAM] Init failed: 0x%x\n", err);
    return;
  }
  
  // Apply sensor settings (this will downscale to HVGA for streaming)
  applyCameraConfig();
  Serial.println("Camera ready: Pre-allocated FHD, Streaming at HVGA.");


  // Set state to WiFi connecting blinking pattern
  __atomic_store_n(&ledNotificationState, LED_STATE_CONNECTING_WIFI, __ATOMIC_SEQ_CST);

  // Initialize WiFiManager
  WiFiManager wm;
  
  Preferences preferences;
  preferences.begin("network", false);
  globalCustomSubnet = preferences.getString("customSubnet", "192.168.1");
  
  WiFiManagerParameter custom_subnet("subnet", "Main Subnet (e.g. 192.168.1)", globalCustomSubnet.c_str(), 16);
  wm.addParameter(&custom_subnet);
  
  // Set timeouts to prevent hanging
  wm.setConnectTimeout(20); // 20 seconds max to try connecting to saved WiFi
  wm.setConfigPortalTimeout(180); // 3 minutes max in captive portal before auto-restarting

  bool res = false;
  if (forceConfigPortal) {
    Serial.println("Starting WiFiManager config portal manually...");
    res = wm.startConfigPortal("ESP32-CAM-Config");
  } else {
    Serial.println("Starting WiFiManager autoConnect...");
    res = wm.autoConnect("ESP32-CAM-Config");
  }
  if(!res) {
      Serial.println("Failed to connect to WiFi. Restarting...");
      delay(3000);
      ESP.restart();
  }
  
  preferences.putString("customSubnet", custom_subnet.getValue());
  globalCustomSubnet = custom_subnet.getValue();
  preferences.end();
  
  Serial.println("\nWiFi connected");

  // Set state to server finding blinking pattern
  __atomic_store_n(&ledNotificationState, LED_STATE_FINDING_SERVER, __ATOMIC_SEQ_CST);

  serverIP = discoverBackendIP();
  
  if (serverIP.toString() != "0.0.0.0") {
    connectWebSocket();
    if (udp.begin(3001)) {
      Serial.println("[UDP] Local socket pre-bound to port 3001");
      udpInitialized = true;
    } else {
      Serial.println("[UDP] Failed to pre-bind local socket!");
    }
  } else {
    Serial.println("[ERR] All discovery methods failed. WebSocket will not start.");
  }
  
  lastWebSocketConnectedTime = millis();
}

// Fungsi capture & upload yang bisa dipanggil dari PIR maupun on-demand
void captureAndUpload(String label) {
  Serial.println("=== captureAndUpload START: " + label + " ===");

  sensor_t * s = esp_camera_sensor_get();
  if (!s) {
    Serial.println("[ERR] Could not get sensor pointer!");
    return;
  }

  // === STEP 1: Switch sensor ke FHD (Memory sudah ter-reserve di setup) ===
  Serial.println("[1] Switching to FHD resolution...");

 
  if (s->id.PID == OV3660_PID) {
    s->set_framesize(s, FRAMESIZE_FHD); // OV3660 supports Full HD (1920x1080)
  } else if (s->id.PID == OV2640_PID) {
    s->set_framesize(s, FRAMESIZE_UXGA); // OV2640 physical limit is UXGA (1600x1200)
  }

  // Override quality to high quality (10) for capture, independent of streaming setting
  s->set_quality(s, 10);

  // Keep WS alive during sensor stabilization
  for (int i = 0; i < 10; i++) {
    webSocket.loop();
    delay(50);
  }

  // Conditionally enable flash based on camera config
  if (cam_flashOnCapture) {
    Serial.println("[2] Flash ON — flushing frames for AEC adjustment...");
    int flashVal = (cam_flashIntensity > 0) ? cam_flashIntensity : 255;
    ledcWrite(FLASH_GPIO_NUM, flashVal);
  } else {
    Serial.println("[2] Flash DISABLED by config — flushing frames...");
  }

  // Buang 2 frame — cukup untuk AEC konvergen
  for (int i = 0; i < 2; i++) {
    camera_fb_t * discard = esp_camera_fb_get();
    if (discard) {
      esp_camera_fb_return(discard);
    }
    // Keep WS alive during frame flush
    webSocket.loop();
    delay(150);
  }

  // === STEP 2: Ambil frame FHD ===
  Serial.println("[3] Capturing frame...");
  camera_fb_t * fb = esp_camera_fb_get();

  // Turn flash back to its configured baseline (cam_flashIntensity) immediately after capture
  if (cam_flashOnCapture) {
    ledcWrite(FLASH_GPIO_NUM, cam_flashIntensity);
    Serial.println("[3] Flash returned to baseline.");
  }

  if (!fb) {
    Serial.println("[ERR] Failed to get FHD frame!");
    applyCameraConfig(); // Restore configured streaming mode
    return;
  }
  Serial.printf("[4] FHD frame captured: %d bytes\n", fb->len);



  // Keep WS alive before HTTP upload
  webSocket.loop();

  // === STEP 3: Upload ke server ===
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    String uploadUrl = "http://" + serverIP.toString() + ":3000/upload?sensor=" + label + "&ip=" + WiFi.localIP().toString();
    Serial.println("[5] Posting to: " + uploadUrl);
    http.setTimeout(20000);
    http.begin(client, uploadUrl);
    http.addHeader("Content-Type", "image/jpeg");
    int httpResponseCode = http.POST(fb->buf, fb->len);
    if (httpResponseCode > 0) {
      Serial.printf("[6] Upload SUCCESS: HTTP %d\n", httpResponseCode);
    } else {
      Serial.printf("[6] Upload FAILED: %s\n", http.errorToString(httpResponseCode).c_str());
    }
    http.end();
  } else {
    Serial.println("[5] WiFi Disconnected, skipping upload.");
  }
  esp_camera_fb_return(fb);

  // Keep WS alive after upload completes
  webSocket.loop();

  // === STEP 4: Kembali ke mode streaming yang terkonfigurasi ===
  Serial.println("[7] Restoring configured streaming mode...");
  applyCameraConfig();
  Serial.println("=== captureAndUpload END ===");
}


void pirTask(void * pvParameters) {
  bool local_prev_left = false;
  bool local_prev_middle = false;
  bool local_prev_right = false;

  for (;;) {
    if (!cam_pirEnabled || !isConnected) {
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    // Poll Left PIR
    bool left = digitalRead(left_pir_pin);
    if (left && !local_prev_left) {
      unsigned long now = millis();
      unsigned long cooldownMs = (unsigned long)cam_pirCooldown * 1000;
      if (lastPirTriggerTime > 0 && (now - lastPirTriggerTime < cooldownMs)) {
        Serial.println("PIR left trigger ignored (cooldown active)");
      } else {
        lastPirTriggerTime = now;
        sweepMode = 0;
        sweepReturning = false;
        setTargetAngle(SERVO_POS_LEFT);
        __atomic_store_n(&pendingLeftMotion, true, __ATOMIC_SEQ_CST);
      }
      local_prev_left = true;
    } else if (!left && local_prev_left) {
      local_prev_left = false;
    }

    // Poll Middle PIR
    bool middle = digitalRead(middle_pir_pin);
    if (middle && !local_prev_middle) {
      unsigned long now = millis();
      unsigned long cooldownMs = (unsigned long)cam_pirCooldown * 1000;
      if (lastPirTriggerTime > 0 && (now - lastPirTriggerTime < cooldownMs)) {
        Serial.println("PIR middle trigger ignored (cooldown active)");
      } else {
        lastPirTriggerTime = now;
        sweepMode = 0;
        sweepReturning = false;
        setTargetAngle(SERVO_POS_MIDDLE);
        __atomic_store_n(&pendingMiddleMotion, true, __ATOMIC_SEQ_CST);
      }
      local_prev_middle = true;
    } else if (!middle && local_prev_middle) {
      local_prev_middle = false;
    }

    // Poll Right PIR
    bool right = digitalRead(right_pir_pin);
    if (right && !local_prev_right) {
      unsigned long now = millis();
      unsigned long cooldownMs = (unsigned long)cam_pirCooldown * 1000;
      if (lastPirTriggerTime > 0 && (now - lastPirTriggerTime < cooldownMs)) {
        Serial.println("PIR right trigger ignored (cooldown active)");
      } else {
        lastPirTriggerTime = now;
        sweepMode = 0;
        sweepReturning = false;
        setTargetAngle(SERVO_POS_RIGHT);
        __atomic_store_n(&pendingRightMotion, true, __ATOMIC_SEQ_CST);
      }
      local_prev_right = true;
    } else if (!right && local_prev_right) {
      local_prev_right = false;
    }

    vTaskDelay(pdMS_TO_TICKS(50)); // Poll every 50ms
  }
}

unsigned long lastPinDebug = 0;

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    if (pendingConnectionRestart) {
      pendingConnectionRestart = false;
      Serial.println("[WSc] Restarting WebSocket connection due to UDP stream mode change...");
      webSocket.disconnect();
    }
    webSocket.loop();

    if (isConnected && lastWsActivity > 0 && millis() - lastWsActivity > WS_LIVENESS_TIMEOUT_MS) {
      forceWebSocketReconnect("heartbeat timeout");
    }

    // If WebSocket is disconnected, try to discover backend IP periodically via UDP unicast
    // Add guard: don't attempt reconnect too soon after a forced disconnect (let close propagate)
    if (!isConnected && millis() - lastForceReconnectTime > 2000) {
      if (millis() - lastDiscoveryQuery > 10000) {
        Serial.println("[DISC] WebSocket disconnected. Sweeping network for backend...");
        __atomic_store_n(&ledNotificationState, LED_STATE_FINDING_SERVER, __ATOMIC_SEQ_CST);
        IPAddress newIP = discoverBackendIP();
        lastDiscoveryQuery = millis(); // Reset timer AFTER the scan finishes
        
        if (newIP.toString() != "0.0.0.0") {
          if (newIP != serverIP) {
            Serial.printf("[DISC] Backend IP changed from %s to %s\n", serverIP.toString().c_str(), newIP.toString().c_str());
            serverIP = newIP;
          }
          // Always try reconnecting if discovered
          connectWebSocket();
        } else {
          Serial.println("[DISC] Backend discovery failed during reconnect.");
        }
      }
    }
  }

  if (isConnected) {
    lastWebSocketConnectedTime = millis();
  }

  // Failsafe reboot if disconnected or unable to connect for more than 120 seconds
  // (increased from 30s — the new heartbeat mechanism handles connection health more precisely)
  if (millis() - lastWebSocketConnectedTime > 120000) {
    Serial.println("[FAILSAFE] WebSocket disconnected or unable to connect for 120 seconds! Rebooting...");
    delay(1000);
    ESP.restart();
  }

  if (!isConnected) {
    delay(50);
    return;
  }

  // Proses on-demand capture DI SINI (di main loop, bukan di WS callback)
  // agar webSocket.loop() bisa bekerja normal selama flush buffer

  if (pendingCaptureLabel != "") {
    String label = pendingCaptureLabel;
    pendingCaptureLabel = "";
    captureAndUpload(label);
  }

  // Proses servo move
  if (pendingServoAngle != -1) {
    int angle = pendingServoAngle;
    pendingServoAngle = -1; // Reset
    setTargetAngle(angle);
    
    // Batalkan auto-return jika digerakkan manual
    isServoWaitingToReturn = false;
  }

  // Proses auto-return servo
  if (isServoWaitingToReturn && millis() > servoReturnTime) {
    setTargetAngle(SERVO_POS_DEFAULT);
    isServoWaitingToReturn = false;
  }

  // Proses pending motion reports secara thread-safe dari pirTask
  bool left = __atomic_exchange_n(&pendingLeftMotion, false, __ATOMIC_SEQ_CST);
  bool middle = __atomic_exchange_n(&pendingMiddleMotion, false, __ATOMIC_SEQ_CST);
  bool right = __atomic_exchange_n(&pendingRightMotion, false, __ATOMIC_SEQ_CST);

  if (left || middle || right) {
    String detectedSensor = left ? "left" : (middle ? "middle" : "right");
    Serial.printf("Motion detected: %s\n", detectedSensor.c_str());
    if (WiFi.status() == WL_CONNECTED) {
      String msg = "{\"type\":\"motion\",\"sensor\":\"" + detectedSensor + "\"}";
      sendWsText(msg, "motion event");
    }
    // Backend will capture the latest stream frame as the PIR snapshot
  }

  // Debug: Print pin states every 2 seconds
  if (millis() - lastPinDebug > 2000) {
    lastPinDebug = millis();
    Serial.printf("PIR Raw: L=%d, M=%d, R=%d\n", 
                  digitalRead(left_pir_pin), 
                  digitalRead(middle_pir_pin), 
                  digitalRead(right_pir_pin));
  }

  if (isConnected && WiFi.status() == WL_CONNECTED) {    
    bool reportStop = __atomic_exchange_n(&pendingSweepStopReport, false, __ATOMIC_SEQ_CST);
    if (reportStop) {
      sendWsText("{\"type\":\"sweep_status\",\"value\":\"off\"}", "sweep stop");
      Serial.println("[WS] Sent sweep stop report to backend");
    }

    // Send independent app-layer heartbeat every 5 seconds as proof-of-life
    if (millis() - lastHeartbeatSent > 5000) {
      lastHeartbeatSent = millis();
      sendWsText("{\"type\":\"heartbeat\"}", "app heartbeat");
    }

    // Send signal strength every 8 seconds
    if (millis() - lastSignalSent > 8000) {
      lastSignalSent = millis();
      long rssi = WiFi.RSSI();
      String msg = "{\"type\":\"signal\",\"rssi\":" + String(rssi) + "}";
      sendWsText(msg, "signal heartbeat");
      Serial.printf("Signal: %ld dBm\n", rssi);
    }

    // Ambil frame untuk dikirim ke kiosk
    camera_fb_t * fb = esp_camera_fb_get();
    if (!fb) {
      // Buffer sedang dipakai (misal saat captureAndUpload), skip frame ini
      delay(10);
      return;
    }

    // Kirim frame JPEG ke kiosk via WebSocket atau UDP (strictly according to configuration)
    bool useUdp = udpStreamEnabled;

    bool sentViaUdp = false;
    if (useUdp) {
      if (!udpInitialized) {
        if (udp.begin(3001)) {
          Serial.println("[UDP] Local socket bound to port 3001");
          udpInitialized = true;
        } else {
          Serial.println("[UDP] Failed to bind local socket!");
        }
      }
      
      if (udpInitialized) {
        static uint8_t udpFrameId = 0;
        udpFrameId++;
        
        size_t totalLen = fb->len;
        size_t maxChunkSize = 1024;
        uint8_t totalChunks = (totalLen + maxChunkSize - 1) / maxChunkSize;
        bool frameSentOk = true;
        unsigned long sendStart = millis();
        
        // Fetch RSSI once per frame instead of per chunk to avoid expensive driver calls
        long rssi = WiFi.RSSI();
        int chunkDelay = 0;
        if (rssi < -65) {
          chunkDelay = 5;
        } else if (rssi < -55) {
          chunkDelay = 3;
        }
        
        for (uint8_t chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
          size_t offset = chunkIdx * maxChunkSize;
          size_t chunkSize = totalLen - offset;
          if (chunkSize > maxChunkSize) {
            chunkSize = maxChunkSize;
          }
          
          if (udp.beginPacket(serverIP, 3001) != 1) {
            frameSentOk = false;
            break;
          }
          
          // Write header (4 bytes): [frameId, totalChunks, chunkIdx, reserved]
          uint8_t header[4];
          header[0] = udpFrameId;
          header[1] = totalChunks;
          header[2] = chunkIdx;
          header[3] = 0;
          udp.write(header, 4);
          
          // Write chunk data
          udp.write(fb->buf + offset, chunkSize);
          
          if (udp.endPacket() != 1) {
            frameSentOk = false;
            break;
          }
          
          // Deteksi timeout transmisi akibat buffer WiFi macet
          if (millis() - sendStart > UDP_TIMEOUT_MS) {
            Serial.println("[UDP] Frame transmission timed out (WiFi congestion)!");
            frameSentOk = false;
            break;
          }
          
          if (chunkDelay > 0) {
            delay(chunkDelay);
          } else {
            yield();
          }
          
          // Yield to websocket loop occasionally to prevent connection starvation
          if (chunkIdx % 4 == 0) {
            webSocket.loop();
          }
        }
        
        if (!frameSentOk) {
          Serial.println("[UDP] Frame send failed!");
        } else {
          sentViaUdp = true;
        }
      }
    }

    if (!sentViaUdp) {
      static uint8_t wsFrameId = 0;
      wsFrameId++;
      
      size_t totalLen = fb->len;
      size_t maxChunkSize = 1024; // 1KB
      uint8_t totalChunks = (totalLen + maxChunkSize - 1) / maxChunkSize;
      
      for (uint8_t chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        size_t offset = chunkIdx * maxChunkSize;
        size_t chunkSize = totalLen - offset;
        if (chunkSize > maxChunkSize) {
          chunkSize = maxChunkSize;
        }
        
        // Use PSRAM-allocated packet buffer if available, fallback to stack-allocated buffer if null
        uint8_t* packet = wsPacketBuffer;
        uint8_t stackPacket[1028];
        if (!packet) {
          packet = stackPacket;
        }
        packet[0] = wsFrameId;
        packet[1] = totalChunks;
        packet[2] = chunkIdx;
        packet[3] = 0;
        memcpy(packet + 4, fb->buf + offset, chunkSize);
        
        if (!sendWsBinary(packet, 4 + chunkSize, "stream frame")) {
          break;
        }
        
        // Yield to allow the network stack to transmit chunks sequentially
        delay(1);
      }
    }
    esp_camera_fb_return(fb);
  }
}
