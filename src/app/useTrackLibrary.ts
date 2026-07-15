import { useCallback, useEffect, useState } from "react";
import { parseTrackBundle } from "../domain/trackCatalog";
import {
  deleteTrackProfile,
  listTrackProfiles,
  saveTrackProfiles,
} from "../domain/trackStorage";
import type { TrackProfileV1 } from "../domain/types";

export interface TrackLibraryState {
  profiles: TrackProfileV1[];
  busy: boolean;
  error?: string;
  refresh: () => Promise<void>;
  importTexts: (texts: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useTrackLibrary(): TrackLibraryState {
  const [profiles, setProfiles] = useState<TrackProfileV1[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      setProfiles(await listTrackProfiles());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importTexts = useCallback(async (texts: string[]) => {
    setBusy(true);
    setError(undefined);
    try {
      const imported = new Map<string, TrackProfileV1>();
      for (const text of texts) {
        const result = parseTrackBundle(text);
        if (!result.profiles) throw new Error(result.error ?? "Invalid track bundle.");
        for (const profile of result.profiles) imported.set(profile.id, profile);
      }
      await saveTrackProfiles([...imported.values()]);
      setProfiles(await listTrackProfiles());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await deleteTrackProfile(id);
      setProfiles(await listTrackProfiles());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  return { profiles, busy, error, refresh, importTexts, remove };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
