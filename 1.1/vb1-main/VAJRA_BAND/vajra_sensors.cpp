#include "vajra_sensors.h"

#ifndef VAJRA_SIMULATION

// Implement I2C reads for production hardware here.
bool readVitals(VitalsData& out) {
    (void)out;
    return false;
}

#endif
