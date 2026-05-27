#include "VajraEdgeAI.h"
#include "generated_model.h"
#include "vajra_recommendations.h"
#include <math.h>
#include <string.h>

VajraEdgeAI::VajraEdgeAI() {
    reset();
}

void VajraEdgeAI::setRecommendation(const char* progmemMsg) {
    currentResult.recommendation = progmemMsg;
    vajraCopyProgmem(currentResult.recommendationBuf, sizeof(currentResult.recommendationBuf), progmemMsg);
}

void VajraEdgeAI::reset() {
    for (int i = 0; i < FILTER_WINDOW_SIZE; ++i) {
        hrBuffer[i] = 0.0f;
        spo2Buffer[i] = 0.0f;
        tempBuffer[i] = 0.0f;
    }
    hrIndex = 0;
    spo2Index = 0;
    tempIndex = 0;
    bufferCount = 0;

    filtered.heartRate = 0.0f;
    filtered.spo2 = 0.0f;
    filtered.temperature = 0.0f;

    currentResult.status = STATUS_NORMAL;
    setRecommendation(VAJRA_MSG_INIT);
    currentResult.triggerEmergencyCall = false;
    currentResult.sendEmergencySMS = false;
    currentResult.fallDetected = false;
    currentResult.triggerLowBatteryAlert = false;
    currentResult.batteryLevel = 100.0f;
    currentResult.latitude = 0.0f;
    currentResult.longitude = 0.0f;

    criticalCounter = 0;
    preFallState = false;
    fallImpactMs = 0;
    stillnessStartMs = 0;
    prevHR = -1.0f;
}

void VajraEdgeAI::feedData(const VitalsData& rawData, unsigned long nowMs) {
    applyFilters(rawData);
    evaluateRules(rawData, nowMs);
}

void VajraEdgeAI::applyFilters(const VitalsData& rawData) {
    hrBuffer[hrIndex] = rawData.heartRate;
    spo2Buffer[spo2Index] = rawData.spo2;
    tempBuffer[tempIndex] = rawData.temperature;

    hrIndex = (hrIndex + 1) % FILTER_WINDOW_SIZE;
    spo2Index = (spo2Index + 1) % FILTER_WINDOW_SIZE;
    tempIndex = (tempIndex + 1) % FILTER_WINDOW_SIZE;

    if (bufferCount < FILTER_WINDOW_SIZE) {
        bufferCount++;
    }

    float hrSum = 0.0f;
    float spo2Sum = 0.0f;
    float tempSum = 0.0f;

    for (int i = 0; i < bufferCount; ++i) {
        hrSum += hrBuffer[i];
        spo2Sum += spo2Buffer[i];
        tempSum += tempBuffer[i];
    }

    filtered.heartRate = hrSum / bufferCount;
    filtered.spo2 = spo2Sum / bufferCount;
    filtered.temperature = tempSum / bufferCount;
}

void VajraEdgeAI::evaluateRules(const VitalsData& rawData, unsigned long nowMs) {
    currentResult.latitude = rawData.latitude;
    currentResult.longitude = rawData.longitude;

    float accMag = 0.0f;
    if (!rawData.sleepMode) {
        accMag = sqrt(rawData.accX * rawData.accX +
                      rawData.accY * rawData.accY +
                      rawData.accZ * rawData.accZ);
    }

    // --- FALL DETECTION (awake only, 15s continuous stillness after >2.5G) ---
    if (!rawData.sleepMode) {
        if (accMag > VAJRA_FALL_G_THRESHOLD) {
            preFallState = true;
            fallImpactMs = nowMs;
            stillnessStartMs = 0;
            currentResult.fallDetected = false;
        }

        if (preFallState) {
            bool isStill = (accMag >= VAJRA_FALL_STILL_MIN && accMag <= VAJRA_FALL_STILL_MAX);

            if (isStill) {
                if (stillnessStartMs == 0) {
                    stillnessStartMs = nowMs;
                } else if ((nowMs - stillnessStartMs) >= VAJRA_FALL_STILLNESS_MS) {
                    currentResult.fallDetected = true;
                    preFallState = false;
                }
            } else {
                stillnessStartMs = 0;
                if (fallImpactMs > 0 && (nowMs - fallImpactMs) > (VAJRA_FALL_STILLNESS_MS + 10000UL)) {
                    preFallState = false;
                }
            }
        }
    } else {
        currentResult.fallDetected = false;
        preFallState = false;
        fallImpactMs = 0;
        stillnessStartMs = 0;
    }

    HealthStatus mlStatus = predictRisk(filtered, rawData, accMag);

    if (mlStatus == STATUS_CRITICAL) {
        criticalCounter++;
        if (criticalCounter >= VAJRA_CRITICAL_DEBOUNCE_TICKS) {
            currentResult.status = STATUS_CRITICAL;
        } else {
            currentResult.status = STATUS_WARNING;
        }
    } else if (currentResult.fallDetected) {
        currentResult.status = STATUS_CRITICAL;
    } else if (mlStatus == STATUS_WARNING) {
        currentResult.status = STATUS_WARNING;
        criticalCounter = 0;
    } else {
        currentResult.status = STATUS_NORMAL;
        criticalCounter = 0;
        if (!preFallState) {
            currentResult.fallDetected = false;
        }
    }

    if (currentResult.status == STATUS_CRITICAL) {
        currentResult.triggerEmergencyCall = true;
        currentResult.sendEmergencySMS = true;

        if (currentResult.fallDetected) {
            setRecommendation(VAJRA_MSG_FALL_CRIT);
        } else if (filtered.spo2 <= VAJRA_SPO2_CRIT) {
            setRecommendation(VAJRA_MSG_SPO2_CRIT);
        } else if (filtered.heartRate > VAJRA_HR_WARN_HIGH || filtered.heartRate < VAJRA_HR_WARN_LOW) {
            setRecommendation(VAJRA_MSG_HR_CRIT);
        } else if (filtered.temperature > VAJRA_TEMP_WARN_HIGH) {
            setRecommendation(VAJRA_MSG_TEMP_CRIT_HIGH);
        } else if (filtered.temperature < VAJRA_TEMP_NORMAL_MIN) {
            setRecommendation(VAJRA_MSG_TEMP_CRIT_LOW);
        } else {
            setRecommendation(VAJRA_MSG_VITAL_CRIT);
        }
    } else if (currentResult.status == STATUS_WARNING) {
        currentResult.triggerEmergencyCall = false;
        currentResult.sendEmergencySMS = false;

        if (filtered.spo2 <= VAJRA_SPO2_WARN) {
            setRecommendation(VAJRA_MSG_SPO2_WARN);
        } else if (filtered.heartRate > VAJRA_HR_NORMAL_MAX || filtered.heartRate < VAJRA_HR_NORMAL_MIN) {
            setRecommendation(VAJRA_MSG_HR_WARN);
        } else if (filtered.temperature > VAJRA_TEMP_NORMAL_MAX) {
            setRecommendation(VAJRA_MSG_TEMP_WARN);
        } else {
            setRecommendation(VAJRA_MSG_VITAL_WARN);
        }
    } else {
        currentResult.triggerEmergencyCall = false;
        currentResult.sendEmergencySMS = false;

        if (currentResult.triggerLowBatteryAlert) {
            setRecommendation(VAJRA_MSG_BATTERY);
        } else if (rawData.sleepMode) {
            setRecommendation(VAJRA_MSG_SLEEP);
        } else {
            setRecommendation(VAJRA_MSG_NORMAL);
        }
    }

    if (rawData.batteryLevel < 30.0f) {
        currentResult.triggerLowBatteryAlert = true;
    } else {
        currentResult.triggerLowBatteryAlert = false;
    }
    currentResult.batteryLevel = rawData.batteryLevel;
    prevHR = filtered.heartRate;
}

FilteredData VajraEdgeAI::getFilteredData() const {
    return filtered;
}

EdgeAIResult VajraEdgeAI::getResult() const {
    return currentResult;
}
