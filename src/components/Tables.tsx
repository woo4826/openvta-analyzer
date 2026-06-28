import { useMemo, useState } from "react";
import type { SensorPoint, VtaFile } from "../domain/types";
import { displayGpsPoints } from "../domain/statistics";

interface TablesProps {
  file: VtaFile;
  sensors: SensorPoint[];
}

export function Tables({ file, sensors }: TablesProps) {
  const [query, setQuery] = useState("");
  const points = useMemo(() => displayGpsPoints(file), [file]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGps = points.filter((point) =>
    [point.source, point.date, point.time, point.provider ?? ""].join(" ").toLowerCase().includes(normalizedQuery),
  );
  const filteredSensors = sensors.filter((sensor) =>
    [sensor.index, sensor.elapsedSeconds, sensor.eventCode].join(" ").toLowerCase().includes(normalizedQuery),
  );

  return (
    <section className="content-band">
      <div className="panel">
        <div className="panel-header">
          <h2>Tables</h2>
          <input
            aria-label="Search tables"
            placeholder="Search rows"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <DataPanel title={`GPS and enhanced points (${filteredGps.length})`}>
        <table>
          <thead>
            <tr>
              <th>Index</th>
              <th>Source</th>
              <th>Date</th>
              <th>Time</th>
              <th>Lat</th>
              <th>Lon</th>
              <th>Speed</th>
              <th>Altitude</th>
              <th>Sat</th>
              <th>Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {filteredGps.map((point, index) => (
              <tr key={`${point.source}-${point.lineNumber}-${index}`}>
                <td>{point.index}</td>
                <td>{point.source}</td>
                <td>{point.date}</td>
                <td>{point.time}</td>
                <td>{point.latitude.toFixed(8)}</td>
                <td>{point.longitude.toFixed(8)}</td>
                <td>{point.speedKmh.toFixed(1)}</td>
                <td>{point.altitudeMeters.toFixed(1)}</td>
                <td>{point.satelliteCount}</td>
                <td>{point.accuracyMeters?.toFixed(2) ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataPanel>
      <DataPanel title={`Sensor rows (${filteredSensors.length})`}>
        <table>
          <thead>
            <tr>
              <th>Index</th>
              <th>Elapsed</th>
              <th>Event</th>
              <th>Unit</th>
              <th>GX</th>
              <th>GY</th>
              <th>GZ</th>
              <th>OX</th>
              <th>OY</th>
              <th>OZ</th>
            </tr>
          </thead>
          <tbody>
            {filteredSensors.map((sensor) => (
              <tr key={`${sensor.lineNumber}-${sensor.index}`}>
                <td>{sensor.index}</td>
                <td>{sensor.elapsedSeconds.toFixed(3)}</td>
                <td>{sensor.eventCode}</td>
                <td>{sensor.accelUnit}</td>
                <td>{sensor.accelX.toFixed(3)}</td>
                <td>{sensor.accelY.toFixed(3)}</td>
                <td>{sensor.accelZ.toFixed(3)}</td>
                <td>{sensor.orientationXDegrees?.toFixed(3) ?? ""}</td>
                <td>{sensor.orientationYDegrees?.toFixed(3) ?? ""}</td>
                <td>{sensor.orientationZDegrees?.toFixed(3) ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataPanel>
    </section>
  );
}

function DataPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>{title}</h3>
      </div>
      <div className="table-wrap">{children}</div>
    </div>
  );
}

