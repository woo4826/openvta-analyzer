import JSZip from "jszip";
import type { LoadedTextFile } from "./types";

export async function loadTextFilesFromInput(file: File): Promise<LoadedTextFile[]> {
  if (file.name.toLowerCase().endsWith(".zip")) {
    return loadVtaFilesFromZip(file);
  }
  return [{ name: file.name, text: await file.text() }];
}

export async function loadVtaFilesFromZip(file: File): Promise<LoadedTextFile[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".vta"),
  );
  return Promise.all(
    entries.map(async (entry) => ({
      name: entry.name.split("/").pop() || entry.name,
      text: await entry.async("text"),
    })),
  );
}

