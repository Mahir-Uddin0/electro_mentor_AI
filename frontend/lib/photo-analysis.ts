import type { PhotoAnalysisResult } from "@/lib/api/client";

const DATABASE_NAME = "electromentor-photo-analysis";
const DATABASE_VERSION = 1;
const FILE_STORE = "pending-uploads";
const PENDING_FILE_KEY_PREFIX = "selected-photo:";
const ANALYSIS_KEY_PREFIX = "electromentor.photo.analysis.";
const ANALYSIS_INDEX_KEY_PREFIX = "electromentor.photo.analysis.ids.";
const MAX_STORED_ANALYSES = 12;

export const MAX_PHOTO_SIZE_BYTES = 14_000_000;
export const PHOTO_INPUT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif";

const PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

const pendingPhotosInMemory = new Map<string, File>();

export function preparePhotoFile(
  selectedFile: File,
): { file: File | null; error: string | null } {
  const extension = selectedFile.name.split(".").pop()?.toLowerCase() ?? "";
  const normalizedType =
    selectedFile.type === "image/jpg"
      ? "image/jpeg"
      : selectedFile.type || MIME_TYPE_BY_EXTENSION[extension];

  if (!normalizedType || !PHOTO_MIME_TYPES.has(normalizedType)) {
    return {
      file: null,
      error: "Choose a JPG, PNG, WebP, HEIC, or HEIF image.",
    };
  }
  if (selectedFile.size > MAX_PHOTO_SIZE_BYTES) {
    return { file: null, error: "The image must be 14 MB or smaller." };
  }

  if (selectedFile.type !== normalizedType) {
    return {
      file: new File([selectedFile], selectedFile.name, {
        type: normalizedType,
        lastModified: selectedFile.lastModified,
      }),
      error: null,
    };
  }
  return { file: selectedFile, error: null };
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE)) {
        database.createObjectStore(FILE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storePendingPhoto(ownerId: string, file: File): Promise<void> {
  pendingPhotosInMemory.set(ownerId, file);
  const database = await openDatabase().catch(() => null);
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(FILE_STORE, "readwrite");
    transaction.objectStore(FILE_STORE).put(file, `${PENDING_FILE_KEY_PREFIX}${ownerId}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
  database.close();
}

export async function getPendingPhoto(ownerId: string): Promise<File | null> {
  const inMemoryFile = pendingPhotosInMemory.get(ownerId);
  if (inMemoryFile) return inMemoryFile;
  const database = await openDatabase().catch(() => null);
  if (!database) return null;

  const storedFile = await new Promise<File | null>((resolve) => {
    const transaction = database.transaction(FILE_STORE, "readonly");
    const request = transaction
      .objectStore(FILE_STORE)
      .get(`${PENDING_FILE_KEY_PREFIX}${ownerId}`);
    request.onsuccess = () => {
      const value = request.result;
      resolve(value instanceof File ? value : null);
    };
    request.onerror = () => resolve(null);
  });
  database.close();
  if (storedFile) pendingPhotosInMemory.set(ownerId, storedFile);
  return storedFile;
}

export async function clearPendingPhoto(ownerId: string): Promise<void> {
  pendingPhotosInMemory.delete(ownerId);
  const database = await openDatabase().catch(() => null);
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(FILE_STORE, "readwrite");
    transaction
      .objectStore(FILE_STORE)
      .delete(`${PENDING_FILE_KEY_PREFIX}${ownerId}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
  database.close();
}

function analysisIndexKey(ownerId: string) {
  return `${ANALYSIS_INDEX_KEY_PREFIX}${ownerId}`;
}

function analysisResultKey(ownerId: string, analysisId: string) {
  return `${ANALYSIS_KEY_PREFIX}${ownerId}.${analysisId}`;
}

function getStoredAnalysisIds(ownerId: string): string[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(analysisIndexKey(ownerId)) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function storePhotoAnalysisResult(
  ownerId: string,
  result: PhotoAnalysisResult,
): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(
    analysisResultKey(ownerId, result.analysis_id),
    JSON.stringify(result),
  );

  const previousIds = getStoredAnalysisIds(ownerId).filter(
    (analysisId) => analysisId !== result.analysis_id,
  );
  const nextIds = [result.analysis_id, ...previousIds].slice(
    0,
    MAX_STORED_ANALYSES,
  );
  sessionStorage.setItem(analysisIndexKey(ownerId), JSON.stringify(nextIds));

  previousIds.slice(MAX_STORED_ANALYSES - 1).forEach((analysisId) => {
    sessionStorage.removeItem(analysisResultKey(ownerId, analysisId));
  });
}

export function getStoredPhotoAnalysis(
  ownerId: string,
  analysisId: string,
): PhotoAnalysisResult | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(analysisResultKey(ownerId, analysisId));
    if (!raw) return null;
    const result = JSON.parse(raw) as Partial<PhotoAnalysisResult>;
    if (
      result.analysis_id !== analysisId ||
      typeof result.summary !== "string" ||
      !result.outcome
    ) {
      return null;
    }
    return result as PhotoAnalysisResult;
  } catch {
    return null;
  }
}

export function listStoredPhotoAnalyses(ownerId: string): PhotoAnalysisResult[] {
  return getStoredAnalysisIds(ownerId)
    .map((analysisId) => getStoredPhotoAnalysis(ownerId, analysisId))
    .filter((result): result is PhotoAnalysisResult => result !== null);
}
