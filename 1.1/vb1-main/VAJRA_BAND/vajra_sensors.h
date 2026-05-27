#ifndef VAJRA_SENSORS_H
#define VAJRA_SENSORS_H

#include "VajraEdgeAI.h"

// HAL: map I2C sensors to VitalsData (MAX30102, MLX90614/TMP117, MPU6050, etc.)
// Return false if a required read failed.
bool readVitals(VitalsData& out);

#endif // VAJRA_SENSORS_H
