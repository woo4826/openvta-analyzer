import { validateTrackProfile } from "./trackProfile";
import type { TrackProfileV1 } from "./types";

export interface TrackCatalogV1 {
  schemaVersion: 1;
  kind: "openvta-track-catalog";
  tracks: TrackProfileV1[];
}

export interface TrackBundleParseResult {
  profiles?: TrackProfileV1[];
  error?: string;
}

export function parseTrackBundle(text: string): TrackBundleParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { error: "Track bundle is not valid JSON." };
  }

  if (isRecord(value) && value.kind === "openvta-track-catalog") {
    if (value.schemaVersion !== 1 || !Array.isArray(value.tracks)) {
      return { error: "Unsupported or invalid track catalog." };
    }
    const profiles: TrackProfileV1[] = [];
    const ids = new Set<string>();
    for (const item of value.tracks) {
      const parsed = validateTrackProfile(item);
      if (!parsed.profile) {
        return { error: `Track catalog contains an invalid profile: ${parsed.error ?? "unknown error"}` };
      }
      if (ids.has(parsed.profile.id)) {
        return { error: `Track catalog contains duplicate id: ${parsed.profile.id}` };
      }
      ids.add(parsed.profile.id);
      profiles.push(parsed.profile);
    }
    return { profiles };
  }

  const parsed = validateTrackProfile(value);
  return parsed.profile ? { profiles: [parsed.profile] } : { error: parsed.error };
}

export function exportTrackCatalog(profiles: TrackProfileV1[]): string {
  const catalog: TrackCatalogV1 = {
    schemaVersion: 1,
    kind: "openvta-track-catalog",
    tracks: profiles,
  };
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
