import { describe, expect, it } from "vitest";
import { parseVtaText } from "../parser";
import { displayGpsPointsWithSources } from "../analysis";
import { applyCalibration, estimateCalibrationOffsets } from "../calibration";
import { applyAccelerationFilter } from "../filtering";
import { exportSegmentVta, exportTransformedVisibleSegmentVta, exportVisibleSegmentVta, validationCsv } from "../export";
import { summarizeVta } from "../statistics";

describe("parseVtaText", () => {
  it("parses modern OpenVTA raw and enhanced rows", () => {
    const trace = parseVtaText(
      "modern.Vta",
      [
        "%% VTALogger Kotlin Version: 0.0.3",
        "%% FormatVersion: 3",
        "$17062026,152258,-33.875000000,151.224998333,12,26,0,6,5.00,gps,435015307830",
        "@17062026,152259,-33.875050000,151.225050000,12,32,181,7,5.50,gps,435015807830,ImuHeading,0.820,imu_heading_10hz,0",
        "#12,1.500,0,-0.083,0.000,0.000,0.100,9.700,0.812,123,2",
      ].join("\n"),
    );

    expect(trace.detectedFormat).toBe("modern-openvta");
    expect(trace.gpsPoints).toHaveLength(1);
    expect(trace.enhancedPoints).toHaveLength(1);
    expect(trace.sensorPoints).toHaveLength(1);
    expect(trace.enhancedPoints[0].confidence).toBeCloseTo(0.82);
    expect(trace.sensorPoints[0].accelUnit).toBe("mps2");
  });

  it("parses legacy phone rows", () => {
    const trace = parseVtaText(
      "phone.Vta",
      [
        "%% VTALogger Version: 1.02a",
        "$23062017,122300,-37.89686679,145.04300318,44,51,97,8",
        "#1,247.095,0,90.201,-87.984,-1.212,-0.268,0.256,9.581",
      ].join("\n"),
    );

    expect(trace.detectedFormat).toBe("legacy-phone");
    expect(trace.gpsPoints[0].latitude).toBeCloseTo(-37.89686679);
    expect(trace.gpsPoints[0].speedKmh).toBe(51);
    expect(trace.sensorPoints[0].index).toBe(1);
    expect(trace.sensorPoints[0].accelZ).toBeCloseTo(9.581);
  });

  it("parses standalone IMU box scaled rows", () => {
    const trace = parseVtaText(
      "imu.Vta",
      [
        "$81116,5435800,-37896827,145042923,3270,700,10849,9",
        "#1210.69,0,-1.4,3.9,3.5,-0.020,0.068,0.997",
      ].join("\n"),
    );

    expect(trace.detectedFormat).toBe("legacy-imu-box");
    expect(trace.gpsPoints[0].latitude).toBeCloseTo(-37.896827);
    expect(trace.gpsPoints[0].longitude).toBeCloseTo(145.042923);
    expect(trace.gpsPoints[0].altitudeMeters).toBeCloseTo(32.7);
    expect(trace.gpsPoints[0].speedKmh).toBeCloseTo(12.8968);
    expect(trace.sensorPoints[0].accelUnit).toBe("g");
  });
});

describe("statistics, calibration, filtering, export", () => {
  it("summarizes route and exports a selected segment", () => {
    const trace = parseVtaText(
      "segment.Vta",
      [
        "$17062026,152258,-33.875000000,151.224998333,12,26,0,6",
        "#1,0.000,0,0,0,0,0.1,0.2,9.7",
        "$17062026,152259,-33.876000000,151.225998333,13,31,0,6",
        "$17062026,152300,-33.877000000,151.226998333,14,38,0,6",
      ].join("\n"),
    );

    const summary = summarizeVta(trace);
    expect(summary.distanceKm).toBeGreaterThan(0.2);
    expect(summary.maxSpeedKmh).toBe(38);
    expect(exportSegmentVta(trace, { startIndex: 0, endIndex: 1 })).toContain("SegmentPointIndexes: 0-1");
  });

  it("exports visible segment GPS rows without reincluding hidden sources", () => {
    const trace = parseVtaText(
      "visible-segment.Vta",
      [
        "%% VTALogger Kotlin Version: 0.0.3",
        "$17062026,152258,-33.875000000,151.224998333,12,26,0,6",
        "#1,0.000,0,0,0,0,0.1,0.2,9.7",
        "@17062026,152259,-33.876000000,151.225998333,13,31,0,6,5.0,gps,1,ImuHeading,0.9,preset,0",
        "#2,1.000,0,0,0,0,0.2,0.3,9.8",
        "$17062026,152300,-33.877000000,151.226998333,14,38,0,6",
      ].join("\n"),
    );

    const rawOnlyPoints = displayGpsPointsWithSources(trace, { rawGps: true, enhancedGps: false });
    const exported = exportVisibleSegmentVta(trace, rawOnlyPoints, { startIndex: 0, endIndex: 1 });

    expect(exported).toContain("$17062026,152258");
    expect(exported).toContain("$17062026,152300");
    expect(exported).toContain("#1,0.000");
    expect(exported).toContain("#2,1.000");
    expect(exported).not.toContain("@17062026,152259");
  });

  it("exports transformed VTA segments with metadata and transformed sensor rows", () => {
    const trace = parseVtaText(
      "transformed-segment.Vta",
      [
        "%% VTALogger Kotlin Version: 0.0.3",
        "$17062026,152258,-33.875000000,151.224998333,12,26,0,6",
        "#1,0.000,0,0,0,0,0.1,0.2,9.7",
        "$17062026,152259,-33.876000000,151.225998333,13,31,0,6",
        "#2,1.000,0,0,0,0,0.2,0.3,9.8",
      ].join("\n"),
    );
    const transformedSensors = trace.sensorPoints.map((sensor) => ({
      ...sensor,
      accelX: sensor.accelX + 1,
    }));
    const exported = exportTransformedVisibleSegmentVta(
      trace,
      displayGpsPointsWithSources(trace, { rawGps: true, enhancedGps: false }),
      { startIndex: 0, endIndex: 1 },
      transformedSensors,
      {
        transformMode: "filtered",
        calibration: { x: 0.1, y: 0.2, z: 0.3, unit: "mps2", sampleCount: 2, sourceName: "cal.Vta" },
        filterSettings: { enabled: true, cutoffHz: 3, channels: { x: true, y: true, z: false } },
      },
    );

    expect(exported).toContain("OpenVTA Analyzer Transformed Segment Export");
    expect(exported).toContain("TransformMode: filtered");
    expect(exported).toContain("Calibration: unit=mps2; samples=2; x=0.1; y=0.2; z=0.3; source=cal.Vta");
    expect(exported).toContain("Filter: enabled=true; cutoffHz=3; channels=XY");
    expect(exported).toContain("#1,0,0,0,0,0,1.1,0.2,9.7");
    expect(exported).not.toContain("#1,0.000,0,0,0,0,0.1,0.2,9.7");
  });

  it("estimates and applies calibration offsets", () => {
    const trace = parseVtaText(
      "cal.Vta",
      [
        "#1,0.000,0,0,0,0,0.2,-0.1,9.9",
        "#2,0.010,0,0,0,0,0.2,-0.1,9.9",
      ].join("\n"),
    );
    const offsets = estimateCalibrationOffsets(trace.sensorPoints);
    const calibrated = applyCalibration(trace.sensorPoints, offsets);

    expect(offsets?.x).toBeCloseTo(0.2);
    expect(calibrated[0].accelX).toBeCloseTo(0);
    expect(calibrated[0].accelZ).toBeCloseTo(9.80665);
  });

  it("filters regular sensor data", () => {
    const trace = parseVtaText(
      "filter.Vta",
      Array.from({ length: 50 }, (_, index) => {
        const noise = index % 2 === 0 ? 1 : -1;
        return `#${index},${(index * 0.01).toFixed(2)},0,0,0,0,${noise},0,9.8`;
      }).join("\n"),
    );
    const result = applyAccelerationFilter(trace.sensorPoints, {
      enabled: true,
      cutoffHz: 3,
      channels: { x: true, y: false, z: false },
    });

    expect(result.sampleRateHz).toBeCloseTo(100);
    expect(Math.abs(result.sensors[20].accelX)).toBeLessThan(1);
  });

  it("exports validation rows with CRLF line endings", () => {
    const csv = validationCsv(
      [
        {
          index: 1,
          elapsedSeconds: 1,
          speedKmh: 36,
          deltaSpeedKmh: 36,
          derivedAccelMps2: 10,
        },
      ],
      "crlf",
    );

    expect(csv).toBe("index,elapsedSeconds,speedKmh,deltaSpeedKmh,derivedAccelMps2\r\n1,1,36,36,10");
  });
});
