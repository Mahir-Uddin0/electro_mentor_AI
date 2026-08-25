"use client";

import { useRouter } from "next/navigation";
import { Camera, ImagePlus } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { RecentPhotoAnalyses } from "@/components/photo-analysis/recent-analyses";
import { Button, Card, PageHeading } from "@/components/ui";
import type { PhotoAnalysisResult } from "@/lib/api/client";
import {
  listStoredPhotoAnalyses,
  PHOTO_INPUT_ACCEPT,
  preparePhotoFile,
  storePendingPhoto,
} from "@/lib/photo-analysis";

export default function PhotoAnalysisPage() {
  const router = useRouter();
  const { user } = useAuth();
  const ownerId = user?.id ?? "preview";
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
  const [previousAnalyses, setPreviousAnalyses] = useState<PhotoAnalysisResult[]>([]);

  useEffect(() => {
    setPreviousAnalyses(listStoredPhotoAnalyses(ownerId));
  }, [ownerId]);

  async function openReview(selectedFile: File) {
    setError("");
    const { file, error: validationError } = preparePhotoFile(selectedFile);
    if (!file) {
      setError(validationError ?? "Choose a supported wiring photo.");
      return;
    }

    setSelecting(true);
    try {
      await storePendingPhoto(ownerId, file);
      router.push("/photo-analysis/review");
    } catch {
      setError("The photo could not be prepared. Please select it again.");
      setSelecting(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void openReview(file);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void openReview(file);
  }

  return (
    <>
      <PageHeading
        title="AI Fault Detection"
        description="Upload a clear wiring photo and let AI check it for visible electrical faults."
      />

      <Card className="generator-card">
        <strong style={{ display: "block", marginBottom: 14, fontSize: 12 }}>
          Capture / Upload wiring photo
        </strong>
        <div
          className="upload-zone"
          style={dragging ? { borderColor: "var(--primary)", background: "var(--primary-soft)" } : undefined}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <span className="upload-icon"><Camera size={28} /></span>
          <h2>Drop your wiring photo here</h2>
          <p>Drag &amp; drop or click to browse</p>
          <div className="inline-actions">
            <Button variant="secondary" icon={Camera} disabled={selecting} onClick={() => cameraInput.current?.click()}>
              Camera Upload
            </Button>
            <Button icon={ImagePlus} disabled={selecting} onClick={() => galleryInput.current?.click()}>
              {selecting ? "Preparing…" : "Gallery Upload"}
            </Button>
          </div>
          <small style={{ marginTop: 15, color: "var(--muted)", fontSize: 10 }}>
            Accepted formats: JPG, PNG, WebP, HEIC, HEIF · Max 14MB
          </small>
          {error && <span className="auth-message error" style={{ marginTop: 12 }}>{error}</span>}
          <input ref={cameraInput} hidden type="file" accept={PHOTO_INPUT_ACCEPT} capture="environment" onChange={onFileChange} />
          <input ref={galleryInput} hidden type="file" accept={PHOTO_INPUT_ACCEPT} onChange={onFileChange} />
        </div>
      </Card>

      <RecentPhotoAnalyses analyses={previousAnalyses} />
    </>
  );
}
