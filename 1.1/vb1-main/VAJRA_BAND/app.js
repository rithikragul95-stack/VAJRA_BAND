/* ==========================================================================
   VAJRA BAND - EMULATOR LOGIC
   C++ Core mirrored logic and real-time visualization controller
   ========================================================================== */

// --- STATE VARIABLES ---
let simInterval = null;
let currentHRRawHistory = [];
let currentHRFilteredHistory = [];
let currentSpO2RawHistory = [];
let currentSpO2FilteredHistory = [];
const CHART_MAX_SAMPLES = 30;

// Thresholds (mirror vajra_thresholds.h)
const VAJRA_SPO2_WARN = 94.5;
const VAJRA_SPO2_CRIT = 88.6;
const VAJRA_HR_NORMAL_MIN = 60;
const VAJRA_HR_NORMAL_MAX = 100;
const VAJRA_HR_WARN_LOW = 50;
const VAJRA_HR_WARN_HIGH = 120;
const VAJRA_TEMP_NORMAL_MIN = 36.0;
const VAJRA_TEMP_NORMAL_MAX = 37.5;
const VAJRA_TEMP_WARN_HIGH = 38.5;
const VAJRA_FALL_G = 2.5;
const VAJRA_FALL_STILLNESS_TICKS = 15;
const VAJRA_SLEEP_TICK_INTERVAL = 8;

// Filter Buffers (Size = 5)
let hrBuffer = [];
let spo2Buffer = [];
let tempBuffer = [];
const FILTER_WINDOW_SIZE = 5;

// Debounce Counters
let criticalCounter = 0;
let preFallState = false;
let consecutiveStillTicks = 0;
let fallDetected = false;
let sleepTickCounter = 0;

// Alert state
let activeCountdown = false;
let countdownVal = 5;
let countdownTimer = null;
let callTimer = null;
let callDuration = 0;

// Battery low alert states
let frameCount = 0;
let lowBatteryAlertTriggered = false;
let lowBatteryAlertCancelled = false;

// Default GPS (Bengaluru coordinates)
let gpsLat = 12.9716;
let gpsLon = 77.5946;

// Fall animation sequence tracker
let fallSequenceActive = false;
let fallSequenceTick = 0;

// --- DOM ELEMENTS ---
const watchScreen = document.getElementById('watchScreen');
const watchHR = document.getElementById('watchHR');
const watchSpO2 = document.getElementById('watchSpO2');
const watchTemp = document.getElementById('watchTemp');
const watchSteps = document.getElementById('watchSteps');
const watchSleepIndicator = document.getElementById('watchSleepIndicator');
const watchStatusBadge = document.getElementById('watchStatusBadge');
const watchStatusText = document.getElementById('watchStatusText');
const statusIcon = document.getElementById('statusIcon');
const watchHeartIcon = document.getElementById('watchHeartIcon');
const watchRecommendationText = document.getElementById('watchRecommendationText');
const watchTime = document.getElementById('watchTime');
const watchBatteryContainer = document.getElementById('watchBatteryContainer');
const watchBatteryIcon = document.getElementById('watchBatteryIcon');
const watchBatteryValue = document.getElementById('watchBatteryValue');

// Countdown Overlay
const watchCountdownOverlay = document.getElementById('watchCountdownOverlay');
const countdownNumber = document.getElementById('countdownNumber');
const countdownReason = document.getElementById('countdownReason');
const btnCancelAlert = document.getElementById('btnCancelAlert');

// Sliders and Inputs
const inputHR = document.getElementById('inputHR');
const inputSpO2 = document.getElementById('inputSpO2');
const inputTemp = document.getElementById('inputTemp');
const inputSleep = document.getElementById('inputSleep');
const inputMotion = document.getElementById('inputMotion');
const inputBattery = document.getElementById('inputBattery');
const valHR = document.getElementById('valHR');
const valSpO2 = document.getElementById('valSpO2');
const valTemp = document.getElementById('valTemp');
const valMotion = document.getElementById('valMotion');
const valBattery = document.getElementById('valBattery');
const sleepMotionDisabledMsg = document.getElementById('sleepMotionDisabledMsg');
const btnTriggerFall = document.getElementById('btnTriggerFall');

// Emergency Overlay
const emergencyOverlay = document.getElementById('emergencyOverlay');
const callStatusText = document.getElementById('callStatusText');
const smsHR = document.getElementById('smsHR');
const smsSpO2 = document.getElementById('smsSpO2');
const smsFall = document.getElementById('smsFall');
const smsLat = document.getElementById('smsLat');
const smsLon = document.getElementById('smsLon');
const smsMapLink = document.getElementById('smsMapLink');
const smsTime = document.getElementById('smsTime');
const btnHangUpCall = document.getElementById('btnHangUpCall');
const btnHangUpWatchSide = document.getElementById('watchSideBtn');

// SVG paths
const pathRawHR = document.getElementById('pathRawHR');
const pathFilteredHR = document.getElementById('pathFilteredHR');
const pathRawSpO2 = document.getElementById('pathRawSpO2');
const pathFilteredSpO2 = document.getElementById('pathFilteredSpO2');

// Preset buttons
const presetBtns = document.querySelectorAll('.btn-preset');

// --- PRESET DEFINITIONS ---
const presets = {
    normal: { hr: 72, spo2: 98, temp: 36.8, sleep: false, motion: 1.0, battery: 87 },
    workout: { hr: 124, spo2: 97, temp: 38.9, sleep: false, motion: 2.8, battery: 72 },
    sleep: { hr: 48, spo2: 96, temp: 36.4, sleep: true, motion: 0.0, battery: 45 },
    hypoxia: { hr: 56, spo2: 86, temp: 36.8, sleep: true, motion: 0.0, battery: 35 },
    panic: { hr: 135, spo2: 95, temp: 36.8, sleep: false, motion: 1.8, battery: 25 },
    fever: { hr: 88, spo2: 97, temp: 38.9, sleep: false, motion: 0.5, battery: 60 }
};

// --- INITIALIZATION ---
window.onload = function() {
    initClock();
    setupEventListeners();
    loadPreset('normal');
    
    // Initialize chart history arrays with baseline data
    for (let i = 0; i < CHART_MAX_SAMPLES; i++) {
        currentHRRawHistory.push(72);
        currentHRFilteredHistory.push(72);
        currentSpO2RawHistory.push(98);
        currentSpO2FilteredHistory.push(98);
    }
    for (let i = 0; i < FILTER_WINDOW_SIZE; i++) {
        tempBuffer.push(36.8);
    }
    
    // Start central simulation tick loop (ticks every 1000ms)
    simInterval = setInterval(simulationTick, 1000);
};

// Simple clock display
function initClock() {
    const updateTime = () => {
        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        watchTime.innerText = `${hrs}:${mins}`;
        
        let ampm = now.getHours() >= 12 ? 'PM' : 'AM';
        let hrs12 = now.getHours() % 12;
        hrs12 = hrs12 ? hrs12 : 12; // 0 should be 12
        const strTime = `${hrs12}:${mins} ${ampm}`;
        smsTime.innerText = strTime;
    };
    updateTime();
    setInterval(updateTime, 30000);
}

// Set up UI Event listeners
function setupEventListeners() {
    // Preset selections
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const presetName = btn.getAttribute('data-preset');
            loadPreset(presetName);
        });
    });

    // Slider inputs
    inputHR.addEventListener('input', () => {
        valHR.innerText = inputHR.value;
        deactivatePresets();
    });

    inputSpO2.addEventListener('input', () => {
        valSpO2.innerText = inputSpO2.value;
        deactivatePresets();
    });

    inputTemp.addEventListener('input', () => {
        valTemp.innerText = parseFloat(inputTemp.value).toFixed(1);
        deactivatePresets();
    });

    inputSleep.addEventListener('change', () => {
        sleepTickCounter = 0;
        deactivatePresets();
        updateSleepModeUI();
    });

    inputMotion.addEventListener('input', () => {
        valMotion.innerText = parseFloat(inputMotion.value).toFixed(1);
        deactivatePresets();
    });

    inputBattery.addEventListener('input', () => {
        valBattery.innerText = inputBattery.value;
        deactivatePresets();
    });

    // Fall trigger button
    btnTriggerFall.addEventListener('click', triggerFallSequence);

    // Alert cancellation
    btnCancelAlert.addEventListener('click', cancelEmergencyCountdown);

    // Call Hangup
    btnHangUpCall.addEventListener('click', resetSystemToNormal);
    btnHangUpWatchSide.addEventListener('click', resetSystemToNormal);
}

// Load preconfigured scenario values
function loadPreset(name) {
    const preset = presets[name];
    if (!preset) return;
    
    inputHR.value = preset.hr;
    valHR.innerText = preset.hr;
    
    inputSpO2.value = preset.spo2;
    valSpO2.innerText = preset.spo2;

    if (preset.temp !== undefined) {
        inputTemp.value = preset.temp;
        valTemp.innerText = preset.temp.toFixed(1);
    }
    
    inputSleep.checked = preset.sleep;
    updateSleepModeUI();
    
    if (!preset.sleep) {
        inputMotion.value = preset.motion;
        valMotion.innerText = preset.motion.toFixed(1);
    }
    
    if (preset.battery !== undefined) {
        inputBattery.value = preset.battery;
        valBattery.innerText = preset.battery;
    }
}

// Clear visual active preset state on custom slider adjustments
function deactivatePresets() {
    presetBtns.forEach(btn => btn.classList.remove('active'));
}

// Adapt the simulator controls based on sleep state
function updateSleepModeUI() {
    const sleepActive = inputSleep.checked;
    if (sleepActive) {
        sleepMotionDisabledMsg.classList.remove('hidden');
        inputMotion.disabled = true;
        btnTriggerFall.disabled = true;
        btnTriggerFall.style.opacity = '0.3';
        watchSleepIndicator.innerHTML = '<i class="fa-solid fa-moon"></i> <span>SLEEPING</span>';
        watchSleepIndicator.classList.add('sleep-active');
    } else {
        sleepMotionDisabledMsg.classList.add('hidden');
        inputMotion.disabled = false;
        btnTriggerFall.disabled = false;
        btnTriggerFall.style.opacity = '1';
        watchSleepIndicator.innerHTML = '<i class="fa-solid fa-moon"></i> <span>AWAKE</span>';
        watchSleepIndicator.classList.remove('sleep-active');
    }
}

// Trigger standard multi-stage fall simulation
function triggerFallSequence() {
    if (inputSleep.checked || fallSequenceActive) return;
    
    fallSequenceActive = true;
    fallSequenceTick = 0;
    preFallState = true;
    deactivatePresets();
    
    btnTriggerFall.disabled = true;
    btnTriggerFall.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fall Simulation In Progress...';
}

// Mirrors generated_model.h (depth=5, ESP32)
function predictRiskML(filtHR, filtSpO2, filtTemp, rawAccVal) {
    if (filtSpO2 <= 95.6952) {
        if (filtHR <= 50.0073) return 2;
        if (filtHR <= 119.8295) {
            if (rawAccVal <= 2.5017) {
                return filtSpO2 <= 88.6360 ? 2 : 1;
            }
            return 2;
        }
        return 2;
    }
    if (filtHR <= 59.9965) {
        if (filtHR <= 50.0254) return 2;
        return filtTemp <= 35.9999 ? 2 : 1;
    }
    if (rawAccVal <= 2.5095) {
        if (filtHR <= 99.2675) {
            return filtTemp <= 36.0634 ? 2 : 0;
        }
        return 1;
    }
    return 2;
}

// --- CENTRAL SIMULATION LOOP TICK ---
function simulationTick() {
    frameCount++;

    const sleepMode = inputSleep.checked;
    if (sleepMode) {
        sleepTickCounter++;
        if (sleepTickCounter % VAJRA_SLEEP_TICK_INTERVAL !== 0) {
            initClockTickOnly();
            return;
        }
    } else {
        sleepTickCounter = 0;
    }
    
    // 1. Gather sensor sliders and inject noise to simulate physical raw sensor signals
    let targetHR = parseInt(inputHR.value);
    let targetSpO2 = parseInt(inputSpO2.value);
    let targetTemp = parseFloat(inputTemp.value);
    let batteryVal = parseInt(inputBattery.value);
    
    // Slowly discharge battery (1% drop every 10 seconds)
    if (frameCount % 10 === 0 && batteryVal > 0) {
        batteryVal = Math.max(0, batteryVal - 1);
        inputBattery.value = batteryVal;
        valBattery.innerText = batteryVal;
    }
    
    // Render battery level on the watch face
    watchBatteryValue.innerText = `${batteryVal}%`;
    watchBatteryIcon.className = 'fa-solid';
    if (batteryVal > 75) {
        watchBatteryIcon.classList.add('fa-battery-full');
    } else if (batteryVal > 50) {
        watchBatteryIcon.classList.add('fa-battery-three-quarters');
    } else if (batteryVal > 25) {
        watchBatteryIcon.classList.add('fa-battery-half');
    } else if (batteryVal > 5) {
        watchBatteryIcon.classList.add('fa-battery-quarter');
    } else {
        watchBatteryIcon.classList.add('fa-battery-empty');
    }
    
    // Evaluate low battery alerting
    if (batteryVal < 30) {
        watchBatteryContainer.classList.add('low-battery');
        
        if (!lowBatteryAlertTriggered && !lowBatteryAlertCancelled && !activeCountdown && emergencyOverlay.classList.contains('hidden')) {
            lowBatteryAlertTriggered = true;
            startEmergencyCountdown("Low Battery Alert (<30%)");
        }
    } else {
        watchBatteryContainer.classList.remove('low-battery');
        lowBatteryAlertTriggered = false;
        lowBatteryAlertCancelled = false;
    }
    
    let rawHR = targetHR;
    let rawSpO2 = targetSpO2;
    let rawTemp = targetTemp;
    let rawAcc = 1.0;
    
    if (fallSequenceActive) {
        fallSequenceTick++;
        if (fallSequenceTick === 1) {
            rawHR = targetHR + 5;
            rawSpO2 = targetSpO2;
            rawTemp = targetTemp;
            rawAcc = 2.8;
            inputMotion.value = 2.8;
            valMotion.innerText = "2.8";
        } else if (fallSequenceTick <= VAJRA_FALL_STILLNESS_TICKS + 1) {
            rawHR = targetHR + 15;
            rawSpO2 = targetSpO2 - 1;
            rawTemp = targetTemp;
            rawAcc = 0.98;
            inputMotion.value = 1.0;
            valMotion.innerText = "1.0";
        } else {
            fallSequenceActive = false;
            btnTriggerFall.disabled = false;
            btnTriggerFall.innerHTML = '<i class="fa-solid fa-person-falling"></i> Trigger Sudden Fall Accident';
            rawAcc = 0.98;
        }
    } else {
        if (targetHR > 0) {
            rawHR += Math.round((Math.random() - 0.5) * 4);
        }
        if (targetSpO2 > 0) {
            rawSpO2 += Math.round(Math.random() * -1.5);
            rawSpO2 = Math.min(100, Math.max(70, rawSpO2));
        }
        rawTemp += (Math.random() - 0.5) * 0.2;
        rawTemp = Math.min(40, Math.max(34, rawTemp));
        rawAcc = sleepMode ? 0.0 : parseFloat(inputMotion.value);
    }
    
    // --- 2. C++ ENGINE MODULE MIGRATED LOGIC ---
    
    // DATA FILTERING (Moving Average Window = 5)
    hrBuffer.push(rawHR);
    spo2Buffer.push(rawSpO2);
    tempBuffer.push(rawTemp);
    if (hrBuffer.length > FILTER_WINDOW_SIZE) hrBuffer.shift();
    if (spo2Buffer.length > FILTER_WINDOW_SIZE) spo2Buffer.shift();
    if (tempBuffer.length > FILTER_WINDOW_SIZE) tempBuffer.shift();
    
    const filtHR = hrBuffer.reduce((a, b) => a + b, 0) / hrBuffer.length;
    const filtSpO2 = spo2Buffer.reduce((a, b) => a + b, 0) / spo2Buffer.length;
    const filtTemp = tempBuffer.reduce((a, b) => a + b, 0) / tempBuffer.length;
    
    // AccMag vector magnitude
    let rawAccVal = parseFloat(rawAcc);
    
    // --- 1. FALL DETECTION STATE MACHINE (Awake Only) ---
    if (!sleepMode) {
        if (rawAccVal > VAJRA_FALL_G) {
            preFallState = true;
            consecutiveStillTicks = 0;
        }
        
        if (preFallState) {
            let isStill = (rawAccVal >= 0.85 && rawAccVal <= 1.15);
            if (isStill) {
                consecutiveStillTicks++;
                if (consecutiveStillTicks >= VAJRA_FALL_STILLNESS_TICKS) {
                    fallDetected = true;
                    preFallState = false;
                }
            } else {
                consecutiveStillTicks = 0;
            }
        }
    } else {
        fallDetected = false;
        preFallState = false;
        consecutiveStillTicks = 0;
    }
    
    const mlStatus = predictRiskML(filtHR, filtSpO2, filtTemp, rawAccVal);
    
    // --- 3. RISK LEVEL CLASSIFICATION & DEBOUNCING ---
    let computedStatus = 0; // 0 = NORMAL, 1 = WARNING, 2 = CRITICAL
    
    if (mlStatus === 2) {
        criticalCounter++;
        if (criticalCounter >= 4) {
            computedStatus = 2;
        } else {
            computedStatus = 1; // Debounce warning
        }
    } 
    else if (fallDetected) {
        computedStatus = 2; // Fall accidents skip vital debounce
    } 
    else if (mlStatus === 1) {
        computedStatus = 1;
        criticalCounter = 0;
    } 
    else {
        computedStatus = 0;
        criticalCounter = 0;
        fallDetected = false;
    }
    
    // RECOMMENDATION ENGINE DECISION
    let advice = "";
    if (computedStatus === 2) {
        if (fallDetected) {
            advice = "CRITICAL [ML]: Fall detected! Dialing family member and dispatching GPS SMS.";
        } else if (filtSpO2 <= VAJRA_SPO2_CRIT) {
            advice = "CRITICAL [ML]: Severe Hypoxia! Oxygen level critically low. Alerting contact.";
        } else if (filtHR > VAJRA_HR_WARN_HIGH || filtHR < VAJRA_HR_WARN_LOW) {
            advice = "CRITICAL [ML]: High Cardiac Stress! Heart rate extreme. Calling family member.";
        } else if (filtTemp > VAJRA_TEMP_WARN_HIGH) {
            advice = "CRITICAL [ML]: High fever detected! Seek medical attention immediately.";
        } else if (filtTemp < VAJRA_TEMP_NORMAL_MIN) {
            advice = "CRITICAL [ML]: Hypothermia detected! Warm patient and alert contact.";
        } else {
            advice = "CRITICAL [ML]: Severe vital boundary breach! Emergency dispatch initiated.";
        }
    } 
    else if (computedStatus === 1) {
        if (filtSpO2 <= VAJRA_SPO2_WARN) {
            advice = "WARNING [ML]: Oxygen saturation dipping. Perform deep breathing and correct posture.";
        } else if (filtHR > VAJRA_HR_NORMAL_MAX || filtHR < VAJRA_HR_NORMAL_MIN) {
            advice = "WARNING [ML]: Heart rate elevated. Please sit down, relax, and hydrate.";
        } else if (filtTemp > VAJRA_TEMP_NORMAL_MAX) {
            advice = "WARNING [ML]: Elevated body temperature. Rest and monitor closely.";
        } else {
            advice = "WARNING [ML]: Vitals fluctuating. Sit down and perform slow breathing.";
        }
    } 
    else {
        if (batteryVal < 30) {
            advice = "SYSTEM [ML]: Low battery detected (<30%)! Low battery alarm sent to family member.";
        } else if (sleepMode) {
            advice = "SYSTEM [ML]: Sleep Mode active. Vitals normal. Motion tracking is powered off.";
        } else {
            advice = "SYSTEM [ML]: Vitals normal. Edge AI smartwatch monitoring active.";
        }
    }
    
    // --- 3. RENDERING & UI SYNCING ---
    
    // Update Watch face
    watchHR.innerText = Math.round(filtHR);
    watchSpO2.innerText = Math.round(filtSpO2);
    watchTemp.innerText = filtTemp.toFixed(1);
    
    // Set heart rate icon pulse rate matching actual vitals
    const pulseDuration = 60 / Math.max(30, filtHR);
    document.documentElement.style.setProperty('--heart-beat-duration', `${pulseDuration}s`);
    
    // Reset watch classes
    watchStatusBadge.className = 'status-badge';
    
    if (computedStatus === 2) {
        watchStatusBadge.classList.add('status-crit');
        watchStatusText.innerText = "CRITICAL";
        statusIcon.className = 'fa-solid fa-triangle-exclamation';
        
        // Trigger Countdown Alert Overlay
        if (!activeCountdown && emergencyOverlay.classList.contains('hidden')) {
            startEmergencyCountdown(fallDetected ? "Fall Accident Detected" : "Critical Vital Failure");
        }
    } else if (computedStatus === 1) {
        watchStatusBadge.classList.add('status-warn');
        watchStatusText.innerText = "WARNING";
        statusIcon.className = 'fa-solid fa-triangle-exclamation';
        cancelEmergencyCountdown();
    } else {
        watchStatusText.innerText = "NORMAL";
        statusIcon.className = 'fa-solid fa-heart-pulse icon-normal';
        cancelEmergencyCountdown();
    }
    
    // Sync recommendations
    watchRecommendationText.innerText = advice;
    
    // Render live C++ code debugger tracer highlights
    updateCodeTracerHighlight(rawAccVal, filtHR, filtSpO2, filtTemp);
    
    // Update SVG charts histories
    updateChartData(rawHR, filtHR, rawSpO2, filtSpO2);
}

// --- SVG CHART RENDERING (No Dependencies) ---
function updateChartData(rawHR, filtHR, rawSpO2, filtSpO2) {
    currentHRRawHistory.push(rawHR);
    currentHRFilteredHistory.push(filtHR);
    currentSpO2RawHistory.push(rawSpO2);
    currentSpO2FilteredHistory.push(filtSpO2);
    
    if (currentHRRawHistory.length > CHART_MAX_SAMPLES) currentHRRawHistory.shift();
    if (currentHRFilteredHistory.length > CHART_MAX_SAMPLES) currentHRFilteredHistory.shift();
    if (currentSpO2RawHistory.length > CHART_MAX_SAMPLES) currentSpO2RawHistory.shift();
    if (currentSpO2FilteredHistory.length > CHART_MAX_SAMPLES) currentSpO2FilteredHistory.shift();
    
    // Plot HR Chart (Y range: 40 to 180 bpm)
    pathRawHR.setAttribute('d', calculateSVGPath(currentHRRawHistory, 40, 180));
    pathFilteredHR.setAttribute('d', calculateSVGPath(currentHRFilteredHistory, 40, 180));
    
    // Plot SpO2 Chart (Y range: 70 to 100%)
    pathRawSpO2.setAttribute('d', calculateSVGPath(currentSpO2RawHistory, 70, 100));
    pathFilteredSpO2.setAttribute('d', calculateSVGPath(currentSpO2FilteredHistory, 70, 100));
}

// Map sensor values to 400x150 SVG coordinates
function calculateSVGPath(dataArray, minVal, maxVal) {
    const width = 400;
    const height = 150;
    const padding = 15;
    
    let path = "";
    for (let i = 0; i < dataArray.length; i++) {
        let x = (i / (dataArray.length - 1)) * width;
        
        // Scale val linearly between min and max val
        let normVal = (dataArray[i] - minVal) / (maxVal - minVal);
        normVal = Math.min(1.0, Math.max(0.0, normVal)); // clamp
        let y = height - padding - normVal * (height - 2 * padding);
        
        if (i === 0) {
            path += `M ${x.toFixed(1)},${y.toFixed(1)}`;
        } else {
            path += ` L ${x.toFixed(1)},${y.toFixed(1)}`;
        }
    }
    return path;
}

// --- LIVE C++ CODE TRACER HIGHLIGHT LOGIC ---
function initClockTickOnly() {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    watchTime.innerText = `${hrs}:${mins}`;
}

function highlightLeaf(id, cls) {
    const el = document.getElementById(id);
    if (el) el.classList.add(cls);
}

function updateCodeTracerHighlight(rawAccVal, filtHR, filtSpO2, filtTemp) {
    const lines = document.querySelectorAll('.code-line');
    lines.forEach(l => { l.className = 'code-line'; });
    
    document.getElementById('ml-header').classList.add('active-branch');
    document.getElementById('ml-func-sig').classList.add('active-branch');
    
    const mlStatus = predictRiskML(filtHR, filtSpO2, filtTemp, rawAccVal);
    const leafCls = mlStatus === 2 ? 'active-rule-critical' : (mlStatus === 1 ? 'active-rule-warning' : 'active-rule-normal');
    
    if (filtSpO2 <= 95.6952) {
        document.getElementById('ml-node-1').classList.add('active-branch');
        if (filtHR <= 50.0073) {
            document.getElementById('ml-node-2').classList.add('active-branch');
            highlightLeaf('ml-node-3', leafCls);
        } else {
            document.getElementById('ml-node-4').classList.add('active-branch');
            document.getElementById('ml-node-5').classList.add('active-branch');
            if (filtHR <= 119.8295) {
                document.getElementById('ml-node-6').classList.add('active-branch');
                if (rawAccVal <= 2.5017) {
                    document.getElementById('ml-node-7').classList.add('active-branch');
                    highlightLeaf(filtSpO2 <= 88.6360 ? 'ml-node-8' : 'ml-node-10', leafCls);
                } else {
                    highlightLeaf('ml-node-12', leafCls);
                }
            } else {
                highlightLeaf('ml-node-15', leafCls);
            }
        }
    } else {
        document.getElementById('ml-node-16').classList.add('active-branch');
        if (filtHR <= 59.9965) {
            document.getElementById('ml-node-17').classList.add('active-branch');
            if (filtTemp <= 35.9999) {
                highlightLeaf('ml-node-19', leafCls);
            } else {
                highlightLeaf('ml-node-21', leafCls);
            }
        } else {
            document.getElementById('ml-node-22').classList.add('active-branch');
            if (rawAccVal <= 2.5095) {
                document.getElementById('ml-node-23').classList.add('active-branch');
                if (filtHR <= 99.2675) {
                    document.getElementById('ml-node-24').classList.add('active-branch');
                    highlightLeaf(filtTemp <= 36.0634 ? 'ml-node-26' : 'ml-node-28', leafCls);
                } else {
                    highlightLeaf('ml-node-30', leafCls);
                }
            } else {
                highlightLeaf('ml-node-32', leafCls);
            }
        }
    }
}

// --- EMERGENCY CRITICAL PIPELINE ---
function startEmergencyCountdown(reason) {
    if (activeCountdown) return;
    
    activeCountdown = true;
    countdownVal = 5;
    countdownNumber.innerText = countdownVal;
    countdownReason.innerText = reason;
    watchCountdownOverlay.classList.remove('hidden');
    
    countdownTimer = setInterval(() => {
        countdownVal--;
        if (countdownVal <= 0) {
            clearInterval(countdownTimer);
            watchCountdownOverlay.classList.add('hidden');
            triggerEmergencyOverlay();
        } else {
            countdownNumber.innerText = countdownVal;
        }
    }, 1000);
}

function cancelEmergencyCountdown() {
    if (!activeCountdown) return;
    
    clearInterval(countdownTimer);
    activeCountdown = false;
    watchCountdownOverlay.classList.add('hidden');
    
    if (countdownReason.innerText.includes("Low Battery")) {
        lowBatteryAlertCancelled = true;
    } else {
        // Soften inputs to prevent immediately triggering it again
        inputHR.value = 75;
        valHR.innerText = "75";
        inputSpO2.value = 97;
        valSpO2.innerText = "97";
        inputTemp.value = 36.8;
        valTemp.innerText = "36.8";
        criticalCounter = 0;
        fallDetected = false;
        preFallState = false;
        consecutiveStillTicks = 0;
        fallSequenceActive = false;
        
        loadPreset('normal');
    }
}

function triggerEmergencyOverlay() {
    activeCountdown = false;
    emergencyOverlay.classList.remove('hidden');
    
    const smsBubbleContent = document.querySelector('.sms-bubble .sms-content');
    
    if (countdownReason.innerText.includes("Low Battery")) {
        // Customize emergency header modal title and SMS content for Low Battery Alert
        document.querySelector('.emergency-modal-header h2').innerText = "VAJRA LOW BATTERY ALARM ACTIVATED";
        document.querySelector('.emergency-modal-header p').innerText = "Device battery critically low. Cell dispatch network active.";
        
        smsBubbleContent.innerHTML = `
            <strong>[LOW BATTERY ALERT]</strong> Wearer's device battery is critically low!<br>
            <span class="sms-vital-log" style="color: var(--color-warning);">
                • Battery Level: <span id="smsBattery">${inputBattery.value}%</span> (CRITICAL)<br>
                • Device State: Monitoring Active
            </span>
            <hr class="sms-divider">
            <strong>GPS Location:</strong><br>
            Lat: <span id="smsLat">${gpsLat.toFixed(6)}</span>, Lon: <span id="smsLon">${gpsLon.toFixed(6)}</span><br>
            <a href="https://maps.google.com/?q=${gpsLat},${gpsLon}" target="_blank" class="sms-map-link" id="smsMapLink">
                <i class="fa-solid fa-map-location-dot"></i> Open real-time location in Maps
            </a>
        `;
    } else {
        // Reset back to normal emergency layout
        document.querySelector('.emergency-modal-header h2').innerText = "VAJRA EMERGENCY SYSTEM ACTIVATED";
        document.querySelector('.emergency-modal-header p').innerText = "Vitals thresholds breached or accident detected. Cell dispatch network active.";
        
        smsBubbleContent.innerHTML = `
            <strong>[CRITICAL ALERT]</strong> Emergency condition detected!<br>
            <span class="sms-vital-log">
                • Heart Rate: <span id="smsHR">${Math.round(hrBuffer.reduce((a, b) => a + b, 0) / hrBuffer.length)}</span> bpm (CRITICAL)<br>
                • Oxygen level: <span id="smsSpO2">${Math.round(spo2Buffer.reduce((a, b) => a + b, 0) / spo2Buffer.length)}</span>% (HYPOXIA)<br>
                • Temperature: <span id="smsTemp">${(tempBuffer.reduce((a, b) => a + b, 0) / tempBuffer.length).toFixed(1)}</span> °C<br>
                • Fall Accident: <span id="smsFall">${fallDetected ? "YES (15s Stillness)" : "NO"}</span>
            </span>
            <hr class="sms-divider">
            <strong>GPS Location:</strong><br>
            Lat: <span id="smsLat">${gpsLat.toFixed(6)}</span>, Lon: <span id="smsLon">${gpsLon.toFixed(6)}</span><br>
            <a href="https://maps.google.com/?q=${gpsLat},${gpsLon}" target="_blank" class="sms-map-link" id="smsMapLink">
                <i class="fa-solid fa-map-location-dot"></i> Open real-time location in Maps
            </a>
        `;
    }
    
    // Simulate Call Dialer State
    callStatusText.innerText = "DIALING VIA eSIM...";
    callStatusText.style.color = "var(--color-warning)";
    
    callTimer = setTimeout(() => {
        callStatusText.innerText = "CONNECTED (Ringing)";
        callStatusText.style.color = "#00e676";
    }, 2000);
}

function resetSystemToNormal() {
    // Hide Emergency screen
    emergencyOverlay.classList.add('hidden');
    clearTimeout(callTimer);
    
    // Reset inputs & buffers to clean normal state
    hrBuffer = [];
    spo2Buffer = [];
    tempBuffer = [];
    criticalCounter = 0;
    fallDetected = false;
    preFallState = false;
    fallSequenceActive = false;
    
    // Reset low battery flags and restore battery level
    lowBatteryAlertTriggered = false;
    lowBatteryAlertCancelled = false;
    inputBattery.value = 87;
    valBattery.innerText = "87";
    
    loadPreset('normal');
    updateSleepModeUI();
}
