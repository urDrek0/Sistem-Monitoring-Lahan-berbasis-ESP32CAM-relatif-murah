#include <WiFiUdp.h>
#include <HTTPClient.h>
#include <WiFi.h>

#define ADC_PIN 0 // Menggunakan pin 0

// ================= WIFI =================
const char *ssid = "Tenda03";
const char *password = "BRHtenda68";

// ================= GATEWAY (UDP DISCOVERY) =================
String globalCustomSubnet = "192.168.1";
String resolvedGatewayIP = "";          // Menyimpan IP hasil resolve
const int backendPort = 3000; // GANTI dengan port backend Node.js Anda

// ================= IDENTITAS NODE =================
const String nodeLocation = "Pagar_Utara";
const String sensorName = "Node_01";

// ================= ADC =================
const float VREF = 3.3;
const int ADC_MAX = 4095;

// ================= THRESHOLD =================
// Sesuaikan jika hasil pengujian berubah
const float CUT_THRESHOLD =
    1.0; // Ambang batas 1.0V (tengah-tengah antara normal 2V dan putus 0V)

// ================= DEBOUNCE =================
const int REQUIRED_CONSECUTIVE_READS =
    4; // Harus 4x berturut-turut putus (1 detik) untuk mengirim alert
const int REQUIRED_CONSECUTIVE_NORMAL =
    4; // Harus 4x berturut-turut normal (1 detik) untuk me-reset status

int cutCounter = 0;
int normalCounter = 0;
bool alertSent = false;

// ================= WIFI =================
void connectWiFi() {
  Serial.print("Connecting WiFi");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi Connected");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

// ================= RESOLVE GATEWAY (UDP DISCOVERY) =================
bool resolveGatewayIP() {
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
        delay(40);
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
        delay(40);
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

  if (foundIP.toString() == "0.0.0.0") {
    Serial.println("UDP Discovery failed! Gateway not found.");
    return false;
  } else {
    resolvedGatewayIP = foundIP.toString();
    Serial.print("Gateway IP resolved: ");
    Serial.println(resolvedGatewayIP);
    return true;
  }
}

// ================= SEND ALERT =================
void sendAlert(float voltage) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return;
  }

  if (resolvedGatewayIP == "") {
    Serial.println("Gagal mengirim alert: IP Gateway belum direseolve.");
    return;
  }

  // --- PERCOBAAN 1: HTTP ---
  WiFiClient clientHttp;
  HTTPClient http;
  
  String urlHttp = "http://" + resolvedGatewayIP + ":" + String(backendPort) +
                   "/api/tripwire" + "?location=" + nodeLocation +
                   "&sensor=" + sensorName;

  Serial.print("Mencoba HTTP -> ");
  Serial.println(urlHttp);

  http.begin(clientHttp, urlHttp);
  int httpCode = http.GET();
  
  Serial.print("HTTP Response: ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    String payload = http.getString();
    Serial.println("Response dari Server: " + payload);
  } else {
    Serial.println("Koneksi HTTP Gagal.");
  }
  
  http.end();
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);

  delay(2000);

  Serial.println("=== NODE PAGAR START ===");

  analogReadResolution(12);
  analogSetPinAttenuation(ADC_PIN, ADC_11db);

  connectWiFi();

  // Standby dan block execution sampai IP Gateway berhasil diresolve
  while (!resolveGatewayIP()) {
    Serial.println("Menunggu gateway via UDP Discovery...");
    delay(2000);
  }
  Serial.println("Gateway ditemukan. Sistem standby memonitor tripwire...");
}

// ================= LOOP =================
void loop() {
  // Teknik membacanya pake yang di voltage_divider_sensing (pin 0)
  int adc0 = analogRead(ADC_PIN);
  float voltage = ((float)adc0 / ADC_MAX) * VREF;

  Serial.printf("P0=%4d | Voltage=%.3f\n", adc0, voltage);

  if (voltage <=
      CUT_THRESHOLD) { // Diubah ke <= karena tegangan menjadi 0V saat putus
    cutCounter++;
    normalCounter = 0; // Reset counter normal karena tegangan drop

    Serial.print("Cut Counter: ");
    Serial.println(cutCounter);

    if (cutCounter >= REQUIRED_CONSECUTIVE_READS && !alertSent) {
      Serial.println("CABLE CUT CONFIRMED");

      sendAlert(voltage);

      alertSent = true;
    }
  } else {
    normalCounter++;
    cutCounter = 0; // Reset counter putus karena tegangan normal

    // Reset status alert hanya jika tegangan benar-benar stabil normal selama
    // beberapa waktu (debounce recovery)
    if (normalCounter >= REQUIRED_CONSECUTIVE_NORMAL) {
      if (alertSent) {
        Serial.println("SYSTEM RECOVERED - NORMAL (Alert Reset)");
        alertSent = false;
      }
      normalCounter = REQUIRED_CONSECUTIVE_NORMAL; // Mencegah overflow
    }
  }

  delay(250);
}
