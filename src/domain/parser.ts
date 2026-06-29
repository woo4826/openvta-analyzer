import type { GpsPoint, ParseWarning, SensorPoint, VtaFile, VtaFormat } from "./types";

const KNOTS_TO_KMH_DOC_FACTOR = 1.8424;

export function parseVtaText(sourceName: string, text: string): VtaFile {
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headers = rawLines.map((line) => line.trim()).filter((line) => line.startsWith("%"));
  const detectedFormat = detectFormat(rawLines);
  const gpsPoints: GpsPoint[] = [];
  const enhancedPoints: GpsPoint[] = [];
  const sensorPoints: SensorPoint[] = [];
  const parseWarnings: ParseWarning[] = [];

  rawLines.forEach((rawLine, zeroIndex) => {
    const lineNumber = zeroIndex + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("%")) {
      return;
    }

    if (line.startsWith("$")) {
      const parsed = parseGpsLine(line, lineNumber, gpsPoints.length, detectedFormat, "RawGps");
      if (parsed.point) {
        gpsPoints.push(parsed.point);
      }
      parseWarnings.push(...parsed.warnings);
      return;
    }

    if (line.startsWith("@")) {
      const parsed = parseEnhancedGpsLine(line, lineNumber, enhancedPoints.length, detectedFormat);
      if (parsed.point) {
        enhancedPoints.push(parsed.point);
      }
      parseWarnings.push(...parsed.warnings);
      return;
    }

    if (line.startsWith("#")) {
      const parsed = parseSensorLine(line, lineNumber, sensorPoints.length, detectedFormat);
      if (parsed.point) {
        sensorPoints.push(parsed.point);
      }
      parseWarnings.push(...parsed.warnings);
      return;
    }

    parseWarnings.push({
      lineNumber,
      code: "unknown-row",
      message: `Ignored row with unknown prefix: ${line.slice(0, 24)}`,
      params: { prefix: line.slice(0, 24) },
    });
  });

  const enhancementPresetId =
    headers
      .find((line) => line.startsWith("%% ImuPresetId:"))
      ?.split(":")
      .slice(1)
      .join(":")
      .trim() ||
    enhancedPoints.find((point) => point.source && point.source !== "Enhanced")?.source;

  return {
    sourceName,
    detectedFormat,
    headers,
    rawLines,
    gpsPoints,
    enhancedPoints,
    sensorPoints,
    enhancementPresetId,
    parseWarnings,
  };
}

export function detectFormat(lines: string[]): VtaFormat {
  const trimmed = lines.map((line) => line.trim()).filter(Boolean);
  if (trimmed.some((line) => line.includes("VTALogger Kotlin") || line.includes("FormatVersion: 3"))) {
    return "modern-openvta";
  }

  const firstGps = trimmed.find((line) => line.startsWith("$"));
  if (firstGps) {
    const parts = splitData(firstGps);
    const latitude = Number(parts[2]);
    const longitude = Number(parts[3]);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      (Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
    ) {
      return "legacy-imu-box";
    }
    if (parts.length >= 10) {
      return "modern-openvta";
    }
  }

  const firstSensor = trimmed.find((line) => line.startsWith("#"));
  if (firstSensor) {
    const parts = splitData(firstSensor);
    if (parts.length === 8 && parts[0].includes(".")) {
      return "legacy-imu-box";
    }
  }

  if (trimmed.some((line) => line.includes("VTALogger Version: 1.02a"))) {
    return "legacy-phone";
  }

  return firstGps || firstSensor ? "legacy-phone" : "unknown";
}

function parseGpsLine(
  line: string,
  lineNumber: number,
  index: number,
  format: VtaFormat,
  source: string,
): { point?: GpsPoint; warnings: ParseWarning[] } {
  const parts = splitData(line);
  const warnings: ParseWarning[] = [];
  if (parts.length < 8) {
    return {
      warnings: [
        {
          lineNumber,
          code: "short-gps-row",
          message: "GPS row has fewer than 8 fields.",
          params: { minimum: 8 },
        },
      ],
    };
  }

  const scaled = format === "legacy-imu-box";
  const latitude = scaled ? toNumber(parts[2]) / 1_000_000 : toNumber(parts[2]);
  const longitude = scaled ? toNumber(parts[3]) / 1_000_000 : toNumber(parts[3]);
  if (!isValidCoordinate(latitude, longitude)) {
    return {
      warnings: [
        {
          lineNumber,
          code: "invalid-coordinate",
          message: `Invalid coordinate latitude=${parts[2]} longitude=${parts[3]}.`,
          params: { latitude: parts[2], longitude: parts[3] },
        },
      ],
    };
  }

  const altitudeMeters = scaled ? toNumber(parts[4]) / 100 : toNumber(parts[4], 0);
  const speedKmh = scaled
    ? (toNumber(parts[5]) / 100) * KNOTS_TO_KMH_DOC_FACTOR
    : toNumber(parts[5], 0);
  const bearingDegrees = scaled ? toNumber(parts[6]) / 100 : toNumber(parts[6], 0);
  const satelliteCount = toInteger(parts[7], 0);
  if (satelliteCount > 0 && satelliteCount < 4) {
    warnings.push({
      lineNumber,
      code: "low-satellite-count",
      message: `GPS row has ${satelliteCount} satellites; 4 or more is preferred for 3D fixes.`,
      params: { count: satelliteCount, minimum: 4 },
    });
  }

  const point: GpsPoint = {
    index,
    lineNumber,
    rawLine: line,
    date: parts[0],
    time: parts[1],
    latitude,
    longitude,
    altitudeMeters,
    speedKmh,
    bearingDegrees,
    satelliteCount,
    accuracyMeters: optionalNumber(parts[8]),
    provider: parts[9] || undefined,
    elapsedRealtimeNanos: optionalNumber(parts[10]),
    epochMillis: parseUtcMillis(parts[0], parts[1]),
    source,
    confidence: 1,
  };

  return { point, warnings };
}

function parseEnhancedGpsLine(
  line: string,
  lineNumber: number,
  index: number,
  format: VtaFormat,
): { point?: GpsPoint; warnings: ParseWarning[] } {
  const parsed = parseGpsLine(line, lineNumber, index, format, splitData(line)[11] || "Enhanced");
  if (parsed.point) {
    const parts = splitData(line);
    parsed.point.confidence = clamp(optionalNumber(parts[12]) ?? 0.75, 0, 1);
    parsed.point.derivedFromRawIndex = optionalInteger(parts[14]);
  }
  return parsed;
}

function parseSensorLine(
  line: string,
  lineNumber: number,
  fallbackIndex: number,
  format: VtaFormat,
): { point?: SensorPoint; warnings: ParseWarning[] } {
  const parts = splitData(line);
  if (format === "legacy-imu-box") {
    if (parts.length < 8) {
      return {
        warnings: [
          {
            lineNumber,
            code: "short-sensor-row",
            message: "Standalone IMU sensor row has fewer than 8 fields.",
            params: { minimum: 8, sensorKind: "standalone" },
          },
        ],
      };
    }
    return {
      point: {
        index: fallbackIndex,
        lineNumber,
        rawLine: line,
        elapsedSeconds: toNumber(parts[0], 0),
        eventCode: toInteger(parts[1], 0),
        orientationXDegrees: optionalNumber(parts[2]),
        orientationYDegrees: optionalNumber(parts[3]),
        orientationZDegrees: optionalNumber(parts[4]),
        accelX: toNumber(parts[5], 0),
        accelY: toNumber(parts[6], 0),
        accelZ: toNumber(parts[7], 0),
        accelUnit: "g",
      },
      warnings: [],
    };
  }

  if (parts.length < 9) {
    return {
      warnings: [
        {
          lineNumber,
          code: "short-sensor-row",
          message: "Sensor row has fewer than 9 fields.",
          params: { minimum: 9, sensorKind: "generic" },
        },
      ],
    };
  }

  return {
    point: {
      index: toInteger(parts[0], fallbackIndex),
      lineNumber,
      rawLine: line,
      elapsedSeconds: toNumber(parts[1], 0),
      eventCode: toInteger(parts[2], 0),
      orientationXDegrees: optionalNumber(parts[3]),
      orientationYDegrees: optionalNumber(parts[4]),
      orientationZDegrees: optionalNumber(parts[5]),
      accelX: toNumber(parts[6], 0),
      accelY: toNumber(parts[7], 0),
      accelZ: toNumber(parts[8], 0),
      accelUnit: "mps2",
      timestampNanos: optionalNumber(parts[9]),
      accuracy: optionalInteger(parts[10]),
      gyroX: optionalNumber(parts[11]),
      gyroY: optionalNumber(parts[12]),
      gyroZ: optionalNumber(parts[13]),
      rotationAzimuth: optionalNumber(parts[14]),
      rotationPitch: optionalNumber(parts[15]),
      rotationRoll: optionalNumber(parts[16]),
    },
    warnings: [],
  };
}

function splitData(line: string): string[] {
  return line.slice(1).split(",").map((part) => part.trim());
}

function toNumber(value: string | undefined, fallback = Number.NaN): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toInteger(value: string | undefined, fallback: number): number {
  const parsed = optionalInteger(value);
  return parsed ?? fallback;
}

function optionalInteger(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseUtcMillis(date: string, time: string): number | undefined {
  const dateDigits = date.replace(/\D/g, "");
  const timeDigits = time.replace(/\D/g, "");
  let day: number;
  let month: number;
  let year: number;
  if (dateDigits.length === 8) {
    day = Number(dateDigits.slice(0, 2));
    month = Number(dateDigits.slice(2, 4));
    year = Number(dateDigits.slice(4, 8));
  } else if (dateDigits.length <= 6 && dateDigits.length >= 5) {
    const padded = dateDigits.padStart(6, "0");
    day = Number(padded.slice(0, 2));
    month = Number(padded.slice(2, 4));
    year = 2000 + Number(padded.slice(4, 6));
  } else {
    return undefined;
  }

  const paddedTime = timeDigits.length > 6 ? timeDigits.padStart(8, "0") : timeDigits.padStart(6, "0");
  const hour = Number(paddedTime.slice(0, 2));
  const minute = Number(paddedTime.slice(2, 4));
  const second = Number(paddedTime.slice(4, 6));
  const millis = paddedTime.length >= 8 ? Number(paddedTime.slice(6, 8).padEnd(3, "0")) : 0;
  const utc = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  return Number.isFinite(utc) ? utc : undefined;
}
