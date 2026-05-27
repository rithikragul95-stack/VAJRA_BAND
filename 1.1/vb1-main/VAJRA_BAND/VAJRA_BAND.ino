#include "VajraEdgeAI.h"
#include "vajra_thresholds.h"

#ifdef VAJRA_SIMULATION
// Simulation-only (default for classroom / USB demo)
#else
#include "vajra_sensors.h"
#endif

VajraEdgeAI edgeAI;

const float MOCK_LAT = 12.9716f;
const float MOCK_LON = 77.5946f;

unsigned long lastTickTime = 0;
int simulationSeconds = 0;

unsigned long getTickInterval(const VitalsData& raw) {
    return raw.sleepMode ? VAJRA_TICK_SLEEP_MS : VAJRA_TICK_AWAKE_MS;
}

#ifdef VAJRA_SIMULATION
VitalsData generateSimulatedSensors(int elapsedSec) {
    VitalsData data;
    data.latitude = MOCK_LAT;
    data.longitude = MOCK_LON;
    data.heartRate = 72.0f;
    data.spo2 = 98.0f;
    data.temperature = 36.8f;
    data.accX = 0.0f;
    data.accY = 0.98f;
    data.accZ = 0.1f;
    data.sleepMode = false;
    data.batteryLevel = 95.0f - (elapsedSec * 0.75f);
    if (data.batteryLevel < 0.0f) data.batteryLevel = 0.0f;

    if (elapsedSec < 20) {
        data.heartRate = 72.0f + sin(elapsedSec * 0.5f) * 3.0f;
        data.spo2 = 98.0f + (elapsedSec % 2 == 0 ? 0.0f : -1.0f);
        data.temperature = 36.8f + sin(elapsedSec * 0.3f) * 0.15f;
        data.sleepMode = false;
    } else if (elapsedSec < 40) {
        data.heartRate = 110.0f + (elapsedSec - 20) * 1.2f;
        data.spo2 = 97.0f - ((elapsedSec - 20) % 3 == 0 ? 1.0f : 0.0f);
        data.temperature = 38.9f;
        data.accX = sin(elapsedSec) * 1.2f;
        data.accY = 0.8f + cos(elapsedSec) * 0.5f;
        data.accZ = 0.5f + sin(elapsedSec * 1.5f) * 0.8f;
        data.sleepMode = false;
    } else if (elapsedSec < 60) {
        data.heartRate = 58.0f - (elapsedSec - 40) * 0.6f;
        data.spo2 = 96.0f;
        data.temperature = 36.4f;
        data.accX = 0.3f;
        data.accY = -0.8f;
        data.accZ = 0.5f;
        data.sleepMode = true;
    } else if (elapsedSec < 80) {
        data.heartRate = 85.0f + (elapsedSec - 60) * 1.5f;
        data.spo2 = 94.0f - (elapsedSec - 60) * 0.6f;
        data.temperature = 36.8f;
        data.sleepMode = false;
    } else if (elapsedSec < 100) {
        int fallStartSec = elapsedSec - 80;
        data.sleepMode = false;
        data.temperature = 36.8f;

        if (fallStartSec < 2) {
            data.heartRate = 78.0f;
            data.spo2 = 97.0f;
            data.accX = 0.1f;
            data.accY = 0.98f;
        } else if (fallStartSec == 2) {
            data.heartRate = 85.0f;
            data.spo2 = 97.0f;
            data.accX = 2.8f;
            data.accY = 1.5f;
            data.accZ = -2.8f;
        } else {
            data.heartRate = 95.0f;
            data.spo2 = 96.0f;
            data.accX = 0.98f;
            data.accY = 0.05f;
            data.accZ = 0.05f;
        }
    } else {
        simulationSeconds = 0;
        edgeAI.reset();
#ifdef VAJRA_DEBUG
        Serial.println(">>> Restarting Simulation Cycle <<<");
#endif
        return generateSimulatedSensors(0);
    }

    return data;
}
#endif

void handleHardwareAlerts(const EdgeAIResult& result, const FilteredData& filtered) {
    static bool callActive = false;
    static bool smsSent = false;
    static bool lowBatterySmsSent = false;

    if (result.triggerLowBatteryAlert) {
        if (!lowBatterySmsSent) {
#ifdef VAJRA_DEBUG
            Serial.println("\n--- [LTE HARDWARE INTERFACE: LOW BATTERY ALARM] ---");
            Serial.println("AT+CMGF=1");
            Serial.println("AT+CMGS=\"+15550199\"");
            Serial.print("SMS Text: \"[VAJRA_ALERT] WARNING: Low battery detected (under 30%)! Current Battery Level: ");
            Serial.print((int)result.batteryLevel);
            Serial.print("%, Temp: ");
            Serial.print(filtered.temperature, 1);
            Serial.println(" C\"");
            Serial.println("AT+CMGS Result: SMS SENT SUCCESSFULLY (OK)");
            Serial.println("---------------------------------------------------\n");
#endif
            lowBatterySmsSent = true;
        }
    } else {
        if (lowBatterySmsSent) {
#ifdef VAJRA_DEBUG
            Serial.println("[LTE HARDWARE] Battery stabilized: Low battery alarm resolved.");
#endif
            lowBatterySmsSent = false;
        }
    }

    if (result.status == STATUS_CRITICAL) {
        if (result.triggerEmergencyCall && !callActive) {
#ifdef VAJRA_DEBUG
            Serial.println("\n--- [LTE HARDWARE INTERFACE: DIALER] ---");
            Serial.println("ATD+15550199;");
            Serial.println(">>> STATUS: Dialing Consented Family Member (Mom)... CONNECTED (Ringing)");
            Serial.println("----------------------------------------\n");
#endif
            callActive = true;
        }

        if (result.sendEmergencySMS && !smsSent) {
#ifdef VAJRA_DEBUG
            Serial.println("\n--- [LTE HARDWARE INTERFACE: SMS DISPATCHER] ---");
            Serial.println("AT+CMGF=1");
            Serial.println("AT+CMGS=\"+15550199\"");
            Serial.print("SMS Text: \"[VAJRA_ALERT] CRITICAL HEALTH DETECTED! ");
            if (result.fallDetected) {
                Serial.print("FALL INCIDENT! ");
            } else {
                Serial.print("VITAL DISTRESS! ");
            }
            Serial.print("HR: "); Serial.print((int)filtered.heartRate);
            Serial.print(" bpm, SpO2: "); Serial.print((int)filtered.spo2);
            Serial.print("%, Temp: "); Serial.print(filtered.temperature, 1);
            Serial.print(" C, GPS Lat: "); Serial.print(result.latitude, 6);
            Serial.print(", Lon: "); Serial.print(result.longitude, 6);
            Serial.print(" - https://maps.google.com/?q=");
            Serial.print(result.latitude, 6); Serial.print(","); Serial.print(result.longitude, 6);
            Serial.println("\"");
            Serial.println("AT+CMGS Result: SMS SENT SUCCESSFULLY (OK)");
            Serial.println("-----------------------------------------------\n");
#endif
            smsSent = true;
        }
    } else {
        if (callActive) {
#ifdef VAJRA_DEBUG
            Serial.println("[LTE HARDWARE] Call disconnected: Patient stabilized.");
#endif
            callActive = false;
        }
        if (smsSent) {
            smsSent = false;
        }
    }
}

void setup() {
    Serial.begin(115200);
    while (!Serial) {
        ;
    }

    Serial.println("=============================================");
    Serial.println("         VAJRA BAND - EDGE AI WATCH          ");
    Serial.println("   ESP32 Real-Time Health & Incident Monitor ");
    Serial.println("=============================================");

    edgeAI.reset();
    lastTickTime = millis();
}

void loop() {
    unsigned long nowMs = millis();

    VitalsData raw;
#ifdef VAJRA_SIMULATION
    raw = generateSimulatedSensors(simulationSeconds);
#else
    if (!readVitals(raw)) {
        return;
    }
#endif

    unsigned long tickMs = getTickInterval(raw);
    if (nowMs - lastTickTime < tickMs) {
        return;
    }
    lastTickTime = nowMs;

    edgeAI.feedData(raw, nowMs);

    EdgeAIResult result = edgeAI.getResult();
    FilteredData filtered = edgeAI.getFilteredData();

    Serial.print("{\"sec\":");
    Serial.print(simulationSeconds);
    Serial.print(",\"mode\":\"");
    Serial.print(raw.sleepMode ? "Sleep" : "Awake");
    Serial.print("\",\"raw_hr\":");
    Serial.print(raw.heartRate, 1);
    Serial.print(",\"filt_hr\":");
    Serial.print(filtered.heartRate, 1);
    Serial.print(",\"raw_spo2\":");
    Serial.print(raw.spo2, 1);
    Serial.print(",\"filt_spo2\":");
    Serial.print(filtered.spo2, 1);
    Serial.print(",\"raw_temp\":");
    Serial.print(raw.temperature, 1);
    Serial.print(",\"filt_temp\":");
    Serial.print(filtered.temperature, 1);
    Serial.print(",\"acc_mag\":");
    Serial.print(sqrt(raw.accX * raw.accX + raw.accY * raw.accY + raw.accZ * raw.accZ), 2);
    Serial.print(",\"status\":");
    Serial.print((int)result.status);
    Serial.print(",\"batt\":");
    Serial.print(result.batteryLevel, 1);
    Serial.print(",\"msg\":\"");
    Serial.print(result.recommendationBuf);
    Serial.println("\"}");

    handleHardwareAlerts(result, filtered);

#ifdef VAJRA_SIMULATION
    simulationSeconds += (int)(tickMs / 1000);
#endif
}
