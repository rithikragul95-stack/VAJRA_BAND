import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import classification_report

# Thresholds aligned with vajra_thresholds.h
SPO2_WARN = 94.5
SPO2_CRIT = 88.6
HR_NORMAL_MIN, HR_NORMAL_MAX = 60, 100
HR_WARN_LOW, HR_WARN_HIGH = 50, 120
TEMP_NORMAL_MIN, TEMP_NORMAL_MAX = 36.0, 37.5
TEMP_WARN_HIGH = 38.5
FALL_G = 2.5


def classify_vital_risk(hr, spo2, temp):
    """Worst status wins: CRITICAL(2) > WARNING(1) > NORMAL(0)."""
    status = 0

    if spo2 <= SPO2_CRIT:
        status = max(status, 2)
    elif spo2 <= SPO2_WARN:
        status = max(status, 1)

    if hr < HR_WARN_LOW or hr > HR_WARN_HIGH:
        status = max(status, 2)
    elif hr < HR_NORMAL_MIN or hr > HR_NORMAL_MAX:
        status = max(status, 1)

    if temp > TEMP_WARN_HIGH or temp < TEMP_NORMAL_MIN:
        status = max(status, 2)
    elif temp > TEMP_NORMAL_MAX:
        status = max(status, 1)

    return status


def classify_sample(hr, spo2, temp, acc_mag, sleep_mode):
    risk = classify_vital_risk(hr, spo2, temp)
    if not sleep_mode and acc_mag > FALL_G:
        risk = max(risk, 2)
    return risk


np.random.seed(42)
num_samples = 10000

print("Generating 10,000 biometric samples simulating wearable sensors...")

sleep_mode = np.random.choice([0, 1], size=num_samples, p=[0.7, 0.3])
heart_rate = np.zeros(num_samples)
spo2 = np.zeros(num_samples)
temperature = np.zeros(num_samples)
acc_mag = np.zeros(num_samples)

for i in range(num_samples):
    if sleep_mode[i] == 1:
        acc_mag[i] = 0.0
        state_rand = np.random.rand()
        if state_rand < 0.75:
            heart_rate[i] = np.random.normal(55, 6)
            spo2[i] = np.random.normal(96.5, 1.2)
            temperature[i] = np.random.normal(36.4, 0.25)
        elif state_rand < 0.93:
            heart_rate[i] = np.random.normal(40, 3) if np.random.rand() < 0.5 else np.random.normal(93, 4)
            spo2[i] = np.random.normal(91.0, 1.0)
            temperature[i] = np.random.normal(36.6, 0.3)
        else:
            heart_rate[i] = np.random.normal(32, 3) if np.random.rand() < 0.5 else np.random.normal(118, 5)
            spo2[i] = np.random.normal(84.0, 2.0)
            temperature[i] = np.random.normal(36.2, 0.4)
        heart_rate[i] = np.clip(heart_rate[i], 25, 150)
        spo2[i] = np.clip(spo2[i], 65, 100)
        temperature[i] = np.clip(temperature[i], 34.5, 39.5)
    else:
        state_rand = np.random.rand()
        if state_rand < 0.70:
            heart_rate[i] = np.random.normal(76, 8)
            spo2[i] = np.random.normal(97.8, 1.0)
            temperature[i] = np.random.normal(36.8, 0.2)
            acc_mag[i] = np.random.uniform(0.1, 2.5)
        elif state_rand < 0.90:
            heart_rate[i] = np.random.normal(115, 6) if np.random.rand() < 0.7 else np.random.normal(52, 3)
            spo2[i] = np.random.normal(93.0, 1.2)
            temperature[i] = np.random.normal(37.9, 0.35) if np.random.rand() < 0.5 else np.random.normal(36.8, 0.2)
            acc_mag[i] = np.random.uniform(0.5, 3.2)
        else:
            fall_incident = np.random.rand() < 0.4
            if fall_incident:
                heart_rate[i] = np.random.normal(92, 10)
                spo2[i] = np.random.normal(96.0, 1.5)
                temperature[i] = np.random.normal(36.8, 0.3)
                acc_mag[i] = np.random.normal(3.5, 0.3)
            else:
                heart_rate[i] = np.random.normal(145, 10) if np.random.rand() < 0.5 else np.random.normal(38, 4)
                spo2[i] = np.random.normal(83.0, 3.0)
                temperature[i] = np.random.normal(38.9, 0.4) if np.random.rand() < 0.5 else np.random.normal(35.5, 0.3)
                acc_mag[i] = np.random.uniform(0.1, 2.0)
        heart_rate[i] = np.clip(heart_rate[i], 30, 220)
        spo2[i] = np.clip(spo2[i], 60, 100)
        temperature[i] = np.clip(temperature[i], 34.0, 40.0)
        acc_mag[i] = np.clip(acc_mag[i], 0.0, 5.0)

risk_level = np.array([
    classify_sample(heart_rate[i], spo2[i], temperature[i], acc_mag[i], sleep_mode[i])
    for i in range(num_samples)
], dtype=int)

df = pd.DataFrame({
    'heart_rate': heart_rate,
    'spo2': spo2,
    'temperature': temperature,
    'acc_mag': acc_mag,
    'sleep_mode': sleep_mode,
    'risk_level': risk_level,
})

df.to_csv('biometric_sleep_dataset.csv', index=False)
print("Saved dataset to 'biometric_sleep_dataset.csv'")

X = df[['heart_rate', 'spo2', 'temperature', 'acc_mag', 'sleep_mode']]
y = df['risk_level']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

clf = DecisionTreeClassifier(max_depth=5, min_samples_leaf=20, random_state=42)
clf.fit(X_train, y_train)

y_pred = clf.predict(X_test)
print("\n--- MODEL PERFORMANCE REPORT ---")
print(classification_report(y_test, y_pred, target_names=['NORMAL', 'WARNING', 'CRITICAL']))

node_count = clf.tree_.node_count
print(f"\nTree nodes: {node_count} (target: <= 80 for ESP32 flash budget)")


def export_tree_to_cpp(tree, feature_names, node=0, depth=1):
    indent = "    " * depth
    if tree.children_left[node] == -1:
        class_distribution = tree.value[node][0]
        predicted_class = int(class_distribution.argmax())
        status_label = ["STATUS_NORMAL", "STATUS_WARNING", "STATUS_CRITICAL"][predicted_class]
        return f"{indent}return {status_label}; // Leaf: class {predicted_class}\n"

    feature_name = feature_names[tree.feature[node]]
    threshold = tree.threshold[node]

    cpp_features = {
        'heart_rate': 'filtered.heartRate',
        'spo2': 'filtered.spo2',
        'temperature': 'filtered.temperature',
        'acc_mag': 'accMag',
        'sleep_mode': 'rawData.sleepMode',
    }
    cpp_feat = cpp_features[feature_name]

    left_child = tree.children_left[node]
    right_child = tree.children_right[node]

    left_code = export_tree_to_cpp(tree, feature_names, left_child, depth + 1)
    right_code = export_tree_to_cpp(tree, feature_names, right_child, depth + 1)

    if feature_name == 'sleep_mode':
        code = f"{indent}if (rawData.sleepMode == false) {{\n"
        code += left_code
        code += f"{indent}}} else {{\n"
        code += right_code
        code += f"{indent}}}\n"
    else:
        code = f"{indent}if ({cpp_feat} <= {threshold:.4f}f) {{\n"
        code += left_code
        code += f"{indent}}} else {{\n"
        code += right_code
        code += f"{indent}}}\n"

    return code


print("\n--- GENERATING EMBEDDED C++ CODE BLOCK ---")
feature_cols = ['heart_rate', 'spo2', 'temperature', 'acc_mag', 'sleep_mode']
cpp_code = export_tree_to_cpp(clf.tree_, feature_cols)

cpp_wrapper = f"""#ifndef GENERATED_MODEL_H
#define GENERATED_MODEL_H

#include "VajraEdgeAI.h"

// Generated via train_model.py (DecisionTreeClassifier, depth=5, ESP32 inline)
inline HealthStatus predictRisk(const FilteredData& filtered, const VitalsData& rawData, float accMag) {{
{cpp_code}}}

#endif // GENERATED_MODEL_H
"""

print(cpp_wrapper)

with open('generated_model.h', 'w', encoding='utf-8') as f:
    f.write(cpp_wrapper)
print("Saved C++ inference code to 'generated_model.h'")
