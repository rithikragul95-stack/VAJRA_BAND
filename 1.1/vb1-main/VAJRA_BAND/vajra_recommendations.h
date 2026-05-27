#ifndef VAJRA_RECOMMENDATIONS_H
#define VAJRA_RECOMMENDATIONS_H

#include <Arduino.h>

// PROGMEM recommendation strings (ESP32 flash)
const char VAJRA_MSG_INIT[] PROGMEM = "Initializing system...";
const char VAJRA_MSG_FALL_CRIT[] PROGMEM = "CRITICAL [ML]: Fall detected! Dialing family member and dispatching GPS SMS.";
const char VAJRA_MSG_SPO2_CRIT[] PROGMEM = "CRITICAL [ML]: Severe Hypoxia! Oxygen level critically low. Alerting contact.";
const char VAJRA_MSG_HR_CRIT[] PROGMEM = "CRITICAL [ML]: High Cardiac Stress! Heart rate extreme. Calling family member.";
const char VAJRA_MSG_TEMP_CRIT_HIGH[] PROGMEM = "CRITICAL [ML]: High fever detected! Seek medical attention immediately.";
const char VAJRA_MSG_TEMP_CRIT_LOW[] PROGMEM = "CRITICAL [ML]: Hypothermia detected! Warm patient and alert contact.";
const char VAJRA_MSG_VITAL_CRIT[] PROGMEM = "CRITICAL [ML]: Severe vital boundary breach! Emergency dispatch initiated.";
const char VAJRA_MSG_SPO2_WARN[] PROGMEM = "WARNING [ML]: Oxygen saturation dipping. Perform deep breathing and correct posture.";
const char VAJRA_MSG_HR_WARN[] PROGMEM = "WARNING [ML]: Heart rate elevated. Please sit down, relax, and hydrate.";
const char VAJRA_MSG_TEMP_WARN[] PROGMEM = "WARNING [ML]: Elevated body temperature. Rest and monitor closely.";
const char VAJRA_MSG_VITAL_WARN[] PROGMEM = "WARNING [ML]: Vitals fluctuating. Sit down and perform slow breathing.";
const char VAJRA_MSG_BATTERY[] PROGMEM = "SYSTEM [ML]: Low battery detected (<30%)! Low battery alarm sent to family member.";
const char VAJRA_MSG_SLEEP[] PROGMEM = "SYSTEM [ML]: Sleep Mode active. Vitals normal. Motion tracking is powered off.";
const char VAJRA_MSG_NORMAL[] PROGMEM = "SYSTEM [ML]: Vitals normal. Edge AI smartwatch monitoring active.";

// Copy PROGMEM string into RAM buffer for Serial/JSON
inline void vajraCopyProgmem(char* dest, size_t destLen, const char* progmemSrc) {
    if (destLen == 0) return;
    strncpy_P(dest, progmemSrc, destLen - 1);
    dest[destLen - 1] = '\0';
}

#endif // VAJRA_RECOMMENDATIONS_H
