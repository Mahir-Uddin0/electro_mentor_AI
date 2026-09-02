"use client";

import { useRouter } from "next/navigation";
import {
  Camera,
  FileImage,
  ImagePlus,
  ScanLine,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { RecentPhotoAnalyses } from "@/components/photo-analysis/recent-analyses";
import { Button, Card, PageHeading } from "@/components/ui";
import { frontendApi } from "@/lib/api/client";
import type { PhotoAnalysisResult } from "@/lib/api/client";
import {
  clearPendingPhoto,
  getPendingPhoto,
  listStoredPhotoAnalyses,
  PHOTO_INPUT_ACCEPT,
  preparePhotoFile,
  storePendingPhoto,
  storePhotoAnalysisResult,
} from "@/lib/photo-analysis";

type PhotoDetails = {
  file: File;
  url: string;
  name: string;
  size: number;
  type: string;
};

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PhotoReviewPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { user } = useAuth();
  const ownerId = user?.id ?? "preview";
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PhotoDetails | null>(null);
  const [restoringPhoto, setRestoringPhoto] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previousAnalyses, setPreviousAnalyses] = useState<PhotoAnalysisResult[]>([]);

  useEffect(() => {
    let active = true;
    setPreviousAnalyses(listStoredPhotoAnalyses(ownerId));
    void getPendingPhoto(ownerId).then((file) => {
      if (!active) return;
      if (file) {
        setPhoto({
          file,
          url: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
          type: file.type,
        });
      }
      setRestoringPhoto(false);
    });
    return () => {
      active = false;
    };
  }, [ownerId]);

  useEffect(() => {
    return () => {
      if (photo?.url.startsWith("blob:")) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  async function replacePhoto(selectedFile: File) {
    setError("");
    const { file, error: validationError } = preparePhotoFile(selectedFile);
    if (!file) {
      setError(t(validationError ?? "Choose a supported wiring photo."));
      return;
    }
    try {
      await storePendingPhoto(ownerId, file);
      setPhoto({
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
        type: file.type,
      });
    } catch {
      setError(t("The photo could not be prepared. Please select it again."));
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void replacePhoto(file);
    event.target.value = "";
  }

  function removePhoto() {
    setPhoto(null);
    void clearPendingPhoto(ownerId);
  }

  async function analyze() {
    if (!photo) {
      setError(t("Select a wiring photo before starting the analysis."));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await frontendApi.analyzePhoto(photo.file);
      storePhotoAnalysisResult(ownerId, result);
      await clearPendingPhoto(ownerId);
      router.push(`/photo-analysis/results/${result.analysis_id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("Analysis could not be started."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeading
        title={t("Review wiring photo")}
        description={t("Confirm that the important wiring details are visible before analysis.")}
        action={<Button variant="secondary" icon={ImagePlus} disabled={loading} onClick={() => inputRef.current?.click()}>{t("Replace Photo")}</Button>}
      />

      <Card className="analysis-layout">
        <div className="analysis-preview">
          {photo ? (
            <img
              src={photo.url}
              alt={t("Selected wiring preview")}
              style={{ width: "100%", height: "100%", maxHeight: 470, objectFit: "contain", borderRadius: 10 }}
            />
          ) : restoringPhoto ? (
            <div className="full-loader" style={{ minHeight: 300, background: "transparent" }}>
              <span className="spinner" /> {t("Loading selected photo…")}
            </div>
          ) : (
            <button
              type="button"
              className="upload-zone"
              style={{ width: "100%", border: 0, cursor: "pointer" }}
              onClick={() => inputRef.current?.click()}
            >
              <span className="upload-icon"><Camera size={27} /></span>
              <h2>{t("Select a wiring photo")}</h2>
              <p>{t("JPG, PNG, WebP, HEIC, HEIF · Max 14MB")}</p>
            </button>
          )}
        </div>

        <div className="file-summary">
          <h2>{t("Photo details")}</h2>
          <div className="key-value"><span>{t("File")}</span><strong>{photo?.name ?? t("Not selected")}</strong></div>
          <div className="key-value"><span>{t("Size")}</span><strong>{photo ? formatBytes(photo.size) : "—"}</strong></div>
          <div className="key-value"><span>{t("Type")}</span><strong>{photo?.type ?? "—"}</strong></div>
          <div className="alert alert-amber">
            <FileImage size={18} />
            <div><strong>{t("Photo tip")}</strong><p>{t("Use good lighting and keep all terminals and wire colors in focus.")}</p></div>
          </div>
        </div>
      </Card>

      <div style={{ marginTop: 12 }}>
        <Card className="generator-card">
          <div className="inline-actions" style={{ justifyContent: "flex-start" }}>
            <Button icon={ScanLine} disabled={loading || restoringPhoto || !photo} onClick={analyze}>
              {loading ? t("Analyzing…") : t("Analyze Wiring")}
            </Button>
            {photo && <Button variant="ghost" icon={Trash2} disabled={loading} onClick={removePhoto}>{t("Remove")}</Button>}
          </div>
          {error && <div className="auth-message error" style={{ marginTop: 12 }}>{error}</div>}
        </Card>
      </div>
      <input ref={inputRef} hidden type="file" accept={PHOTO_INPUT_ACCEPT} onChange={onFileChange} />

      <RecentPhotoAnalyses analyses={previousAnalyses} />
    </>
  );
}
