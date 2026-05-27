#ifndef VAJRA_THRESHOLDS_H
#define VAJRA_THRESHOLDS_H

// Clinical / product thresholds — single source for ESP32 Edge AI firmware

constexpr float VAJRA_SPO2_WARN = 94.5f;
constexpr float VAJRA_SPO2_CRIT = 88.6f;

constexpr float VAJRA_HR_NORMAL_MIN = 60.0f;
constexpr float VAJRA_HR_NORMAL_MAX = 100.0f;
constexpr float VAJRA_HR_WARN_LOW = 50.0f;
constexpr float VAJRA_HR_WARN_HIGH = 120.0f;

constexpr float VAJRA_TEMP_NORMAL_MIN = 36.0f;
constexpr float VAJRA_TEMP_NORMAL_MAX = 37.5f;
constexpr float VAJRA_TEMP_WARN_HIGH = 38.5f;

constexpr float VAJRA_FALL_G_THRESHOLD = 2.5f;
constexpr float VAJRA_FALL_STILL_MIN = 0.85f;
constexpr float VAJRA_FALL_STILL_MAX = 1.15f;
constexpr unsigned long VAJRA_FALL_STILLNESS_MS = 15000UL;

constexpr unsigned long VAJRA_TICK_AWAKE_MS = 2000UL;
constexpr unsigned long VAJRA_TICK_SLEEP_MS = 8000UL;

constexpr int VAJRA_CRITICAL_DEBOUNCE_TICKS = 4;

#endif // VAJRA_THRESHOLDS_H
