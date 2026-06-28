export const sampleVtaName = "OpenVTA_sample.Vta";
export const sampleCalibrationName = "CAL_sample.Vta";

export const sampleVtaText = [
  "%% VTALogger Kotlin Version: 0.0.3",
  "%% FormatVersion: 3",
  "%% ImuPresetId: imu_heading_10hz",
  "% $UTCDate,UTCTime,Latitude,Longitude,Altitude,Speed,Bearing,NumSat,AccuracyMeters,Provider,ElapsedRealtimeNanos",
  "% @UTCDate,UTCTime,Latitude,Longitude,Altitude,Speed,Bearing,NumSat,AccuracyMeters,Provider,ElapsedRealtimeNanos,Source,Confidence,ImuPresetId,DerivedFromRawIndex",
  "% #Idx,Time,Event,OX,OY,OZ,GX,GY,GZ,SensorTimestampNanos,SensorAccuracy,GyroX,GyroY,GyroZ,RotAzimuth,RotPitch,RotRoll",
  ...buildRows(),
  "%% End",
].join("\n");

export const sampleCalibrationText = [
  "%% VTALogger Kotlin Version: 0.0.3",
  "%% FormatVersion: 3",
  "% #Idx,Time,Event,OX,OY,OZ,GX,GY,GZ",
  ...Array.from({ length: 160 }, (_, index) => {
    const t = index / 100;
    const noise = Math.sin(index * 0.41) * 0.015;
    return `#${index},${t.toFixed(3)},0,0.000,0.000,0.000,${(0.18 + noise).toFixed(3)},${(-0.12 + noise / 2).toFixed(3)},${(9.95 + noise).toFixed(3)}`;
  }),
  "%% End",
].join("\n");

function buildRows(): string[] {
  const rows: string[] = [];
  const startLat = -33.875;
  const startLon = 151.224998333;
  for (let second = 0; second <= 36; second += 1) {
    const date = "17062026";
    const time = `1522${String(20 + second).padStart(2, "0")}`;
    const angle = second / 5.5;
    const lat = startLat + second * 0.000045 + Math.sin(angle) * 0.00008;
    const lon = startLon + second * 0.00006 + Math.cos(angle) * 0.00009;
    const speed = Math.max(0, Math.round(12 + Math.sin(angle / 1.5) * 8 + second * 0.7));
    const bearing = Math.round((45 + second * 4) % 360);
    const altitude = 18 + Math.sin(angle) * 3;
    rows.push(
      `$${date},${time},${lat.toFixed(9)},${lon.toFixed(9)},${altitude.toFixed(0)},${speed},${bearing},8,4.50,gps,${435015000000 + second * 1_000_000_000}`,
    );
    if (second > 0 && second < 36) {
      rows.push(
        `@${date},${time},${(lat + 0.000015).toFixed(9)},${(lon + 0.000012).toFixed(9)},${altitude.toFixed(0)},${(speed + 2).toFixed(0)},${bearing},8,4.20,gps,${435015500000 + second * 1_000_000_000},ImuHeading,0.840,imu_heading_10hz,${second}`,
      );
    }
    for (let tick = 0; tick < 5; tick += 1) {
      const index = second * 5 + tick;
      const elapsed = second + tick / 5;
      const accelX = Math.sin(elapsed * 1.4) * 0.42 + 0.18;
      const accelY = Math.cos(elapsed * 1.1) * 0.34 - 0.12;
      const accelZ = 9.82 + Math.sin(elapsed * 2.3) * 0.08;
      rows.push(
        `#${index},${elapsed.toFixed(3)},0,${(Math.sin(elapsed / 4) * 2).toFixed(3)},${(Math.cos(elapsed / 5) * 1.4).toFixed(3)},${bearing.toFixed(3)},${accelX.toFixed(3)},${accelY.toFixed(3)},${accelZ.toFixed(3)},${123000000 + index * 10_000_000},2`,
      );
    }
  }
  return rows;
}

