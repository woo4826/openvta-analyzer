import { useCallback, useEffect, useMemo, useState } from "react";
import { loadHostedTrackPresets } from "../domain/trackPresetIndex";
import {
  deleteTrackProfile,
  getTrackProfileOrigins,
  listTrackProfiles,
  type TrackProfileOrigin,
} from "../domain/trackStorage";
import type { GpsPoint, TrackProfileV1 } from "../domain/types";

export type EffectiveTrackProfileOrigin = "built-in" | TrackProfileOrigin;
export type TrackPresetLoadStatus = "loading" | "ready" | "hosted-unavailable";

export interface EffectiveTrackProfile {
  profile: TrackProfileV1;
  origin: EffectiveTrackProfileOrigin;
}

export interface TrackPresetState {
  profiles: EffectiveTrackProfile[];
  hostedProfiles: TrackProfileV1[];
  status: TrackPresetLoadStatus;
  resetOverride: (id: string) => Promise<void>;
  reload: () => void;
}

export function useTrackPresets(points: GpsPoint[]): TrackPresetState {
  const [hostedProfiles, setHostedProfiles] = useState<TrackProfileV1[]>([]);
  const [localProfiles, setLocalProfiles] = useState<TrackProfileV1[]>([]);
  const [origins, setOrigins] = useState<Record<string, TrackProfileOrigin>>({});
  const [status, setStatus] = useState<TrackPresetLoadStatus>("loading");
  const [loadedRecordingKey, setLoadedRecordingKey] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);
  const recordingKey = `${points.length}:${points[0]?.longitude ?? ""}:${points[0]?.latitude ?? ""}:${points.at(-1)?.longitude ?? ""}:${points.at(-1)?.latitude ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void Promise.allSettled([
      loadHostedTrackPresets(points),
      Promise.all([listTrackProfiles(), getTrackProfileOrigins()]),
    ]).then(([hostedResult, localResult]) => {
      if (cancelled) return;
      if (hostedResult.status === "fulfilled") setHostedProfiles(hostedResult.value);
      else setHostedProfiles([]);
      if (localResult.status === "fulfilled") {
        setLocalProfiles(localResult.value[0]);
        setOrigins(localResult.value[1]);
      } else {
        setLocalProfiles([]);
        setOrigins({});
      }
      setStatus(hostedResult.status === "fulfilled" ? "ready" : "hosted-unavailable");
      setLoadedRecordingKey(recordingKey);
    });
    return () => {
      cancelled = true;
    };
  // A parser or caller may recreate an equivalent array during render. Reload only
  // when the recording identity changes, not when its array reference changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingKey, reloadKey]);

  const profiles = useMemo(() => {
    const effective = new Map<string, EffectiveTrackProfile>();
    for (const profile of hostedProfiles) {
      effective.set(profile.id, { profile, origin: "built-in" });
    }
    for (const profile of localProfiles) {
      const origin = origins[profile.id] ?? inferOrigin(profile);
      if (effective.has(profile.id) && origin !== "local-override") continue;
      effective.set(profile.id, { profile, origin });
    }
    return [...effective.values()].sort((left, right) => {
      if (left.origin === "local-override" && right.origin !== "local-override") return -1;
      if (right.origin === "local-override" && left.origin !== "local-override") return 1;
      return right.profile.updatedAt.localeCompare(left.profile.updatedAt);
    });
  }, [hostedProfiles, localProfiles, origins]);

  const resetOverride = useCallback(async (id: string) => {
    if (!hostedProfiles.some((profile) => profile.id === id)) return;
    await deleteTrackProfile(id);
    setLocalProfiles((profiles) => profiles.filter((profile) => profile.id !== id));
    setOrigins((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }, [hostedProfiles]);

  const hasCurrentRecording = loadedRecordingKey === recordingKey;
  return {
    profiles: hasCurrentRecording ? profiles : [],
    hostedProfiles: hasCurrentRecording ? hostedProfiles : [],
    status: hasCurrentRecording ? status : "loading",
    resetOverride,
    reload: () => setReloadKey((key) => key + 1),
  };
}

function inferOrigin(profile: TrackProfileV1): TrackProfileOrigin {
  if (profile.source.kind === "osm") return "osm";
  if (profile.source.kind === "recording") return "generated";
  return "imported";
}
