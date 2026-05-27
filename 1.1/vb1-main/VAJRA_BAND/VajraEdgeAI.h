#ifndef VAJRA_EDGE_AI_H
#define VAJRA_EDGE_AI_H

#include "vajra_thresholds.h"

enum HealthStatus {
    STATUS_NORMAL = 0,
    STATUS_WARNING = 1,
    STATUS_CRITICAL = 2
};

struct VitalsData {
    float heartRate;
    float spo2;
    float temperature;
    float accX;
    float accY;
    float accZ;
    bool sleepMode;
    float latitude;
    float longitude;
    float batteryLevel;
};

struct FilteredData {
    float heartRate;
    float spo2;
    float temperature;
};

struct EdgeAIResult {
    HealthStatus status;
    const char* recommendation;
    bool triggerEmergencyCall;
    bool sendEmergencySMS;
    bool fallDetected;
    bool triggerLowBatteryAlert;
    float latitude;
    float longitude;
    float batteryLevel;
    char recommendationBuf[160];
};

class VajraEdgeAI {
public:
    VajraEdgeAI();

    void reset();
    void feedData(const VitalsData& rawData, unsigned long nowMs);
    EdgeAIResult getResult() const;
    FilteredData getFilteredData() const;

private:
    static const int FILTER_WINDOW_SIZE = 5;

    float hrBuffer[FILTER_WINDOW_SIZE];
    float spo2Buffer[FILTER_WINDOW_SIZE];
    float tempBuffer[FILTER_WINDOW_SIZE];
    int hrIndex;
    int spo2Index;
    int tempIndex;
    int bufferCount;

    FilteredData filtered;
    EdgeAIResult currentResult;

    int criticalCounter;
    bool preFallState;
    uint32_t fallImpactMs;
    uint32_t stillnessStartMs;
    float prevHR;

    void applyFilters(const VitalsData& rawData);
    void evaluateRules(const VitalsData& rawData, unsigned long nowMs);
    void setRecommendation(const char* progmemMsg);
};

#endif // VAJRA_EDGE_AI_H
