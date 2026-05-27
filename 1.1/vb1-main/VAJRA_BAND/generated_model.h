#ifndef GENERATED_MODEL_H
#define GENERATED_MODEL_H

#include "VajraEdgeAI.h"

// Generated via train_model.py (DecisionTreeClassifier, depth=5, ESP32 inline)
inline HealthStatus predictRisk(const FilteredData& filtered, const VitalsData& rawData, float accMag) {
    if (filtered.spo2 <= 95.6952f) {
        if (filtered.heartRate <= 50.0073f) {
            return STATUS_CRITICAL; // Leaf: class 2
        } else {
            if (filtered.heartRate <= 119.8295f) {
                if (accMag <= 2.5017f) {
                    if (filtered.spo2 <= 88.6360f) {
                        return STATUS_CRITICAL; // Leaf: class 2
                    } else {
                        return STATUS_WARNING; // Leaf: class 1
                    }
                } else {
                    return STATUS_CRITICAL; // Leaf: class 2
                }
            } else {
                if (filtered.heartRate <= 120.4741f) {
                    return STATUS_CRITICAL; // Leaf: class 2
                } else {
                    return STATUS_CRITICAL; // Leaf: class 2
                }
            }
        }
    } else {
        if (filtered.heartRate <= 59.9965f) {
            if (filtered.heartRate <= 50.0254f) {
                return STATUS_CRITICAL; // Leaf: class 2
            } else {
                if (filtered.temperature <= 35.9999f) {
                    return STATUS_CRITICAL; // Leaf: class 2
                } else {
                    return STATUS_WARNING; // Leaf: class 1
                }
            }
        } else {
            if (accMag <= 2.5095f) {
                if (filtered.heartRate <= 99.2675f) {
                    if (filtered.temperature <= 36.0634f) {
                        return STATUS_CRITICAL; // Leaf: class 2
                    } else {
                        return STATUS_NORMAL; // Leaf: class 0
                    }
                } else {
                    return STATUS_WARNING; // Leaf: class 1
                }
            } else {
                return STATUS_CRITICAL; // Leaf: class 2
            }
        }
    }
}

#endif // GENERATED_MODEL_H
