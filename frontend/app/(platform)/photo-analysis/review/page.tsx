"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
  ChevronRight,
  Eye,
  FileImage,
  ImagePlus,
  ScanLine,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Badge, Button, Card, PageHeading, SectionTitle } from "@/components/ui";
import { frontendApi } from "@/lib/api/client";

type PhotoDetails = {
  url: string;
  name: string;
  size: number;
  type: string;
};

const previousAnalyses = [
  { id: "AN-1039", title: "Exposed Live Wire", date: "2025-01-10", severity: "Critical", confidence: "99%" },
  { id: "AN-1040", title: "Overloaded Circuit", date: "2025-01-08", severity: "High", confidence: "91%" },
  { id: "AN-1041", title: "Missing Ground Connection", date: "2025-01-05", severity: "High", confidence: "87%" },
  { id: "AN-1038", title: "Loose Neutral Wire", date: "2025-01-02", severity: "High", confidence: "96%" },
];

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PhotoReviewPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PhotoDetails | null>(null);
  const [sample, setSample] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = sessionStorage.getItem("electromentor.photo.url");
    if (!url) return;
    setPhoto({
      url,
      name: sessionStorage.getItem("electromentor.photo.name") ?? "wiring-photo.jpg",
      size: Number(sessionStorage.getItem("electromentor.photo.size") ?? 0),
      type: sessionStorage.getItem("electromentor.photo.type") ?? "image/jpeg",
    });
  }, []);

  function storePhoto(file: File) {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("The selected image is larger than 20 MB.");
      return;
    }
    if (photo?.url.startsWith("blob:")) URL.revokeObjectURL(photo.url);
    const url = URL.createObjectURL(file);
    const next = { url, name: file.name, size: file.size, type: file.type || "image/*" };
    setPhoto(next);
    setSample(false);
    sessionStorage.setItem("electromentor.photo.url", url);
    sessionStorage.setItem("electromentor.photo.name", file.name);
    sessionStorage.setItem("electromentor.photo.size", String(file.size));
    sessionStorage.setItem("electromentor.photo.type", next.type);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) storePhoto(file);
    event.target.value = "";
  }

  function removePhoto() {
    if (photo?.url.startsWith("blob:")) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setSample(false);
    ["url", "name", "size", "type"].forEach((key) =>
      sessionStorage.removeItem(`electromentor.photo.${key}`),
    );
  }

  async function analyze(useSample = false) {
    if (!photo && !sample && !useSample) {
      setError("Select a photo or use the sample analysis first.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await frontendApi.analyzePhoto();
      router.push(`/photo-analysis/results/${result.analysisId}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Analysis could not be started.");
    } finally {
      setLoading(false);
    }
  }

  function showSample() {
    removePhoto();
    setSample(true);
  }

  return (
    <>
      <PageHeading
        title="Review wiring photo"
        description="Confirm that the important wiring details are visible before analysis."
        action={<Button variant="secondary" icon={ImagePlus} onClick={() => inputRef.current?.click()}>Replace Photo</Button>}
      />

      <Card className="analysis-layout">
        <div className="analysis-preview">
          {photo ? (
            <img
              src={photo.url}
              alt="Selected wiring preview"
              style={{ width: "100%", height: "100%", maxHeight: 470, objectFit: "contain", borderRadius: 10 }}
            />
          ) : sample ? (
            <div style={{ display: "grid", justifyItems: "center", gap: 13 }}>
              <div className="wire-illustration" />
              <Badge tone="blue">Sample wiring photo</Badge>
            </div>
          ) : (
            <button
              type="button"
              className="upload-zone"
              style={{ width: "100%", border: 0, cursor: "pointer" }}
              onClick={() => inputRef.current?.click()}
            >
              <span className="upload-icon"><Camera size={27} /></span>
              <h2>Select a wiring photo</h2>
              <p>JPG, PNG, HEIC · Max 20MB</p>
            </button>
          )}
        </div>

        <div className="file-summary">
          <h2>Photo details</h2>
          <div className="key-value"><span>File</span><strong>{photo?.name ?? (sample ? "sample-wiring.jpg" : "Not selected")}</strong></div>
          <div className="key-value"><span>Size</span><strong>{photo ? formatBytes(photo.size) : sample ? "1.2 MB" : "—"}</strong></div>
          <div className="key-value"><span>Type</span><strong>{photo?.type ?? (sample ? "image/jpeg" : "—")}</strong></div>
          <div className="alert alert-amber">
            <FileImage size={18} />
            <div><strong>Photo tip</strong><p>Use good lighting and keep all terminals and wire colors in focus.</p></div>
          </div>
        </div>
      </Card>

      <div style={{ marginTop: 12 }}>
        <Card className="generator-card">
          <div className="inline-actions" style={{ justifyContent: "flex-start" }}>
            <Button icon={ScanLine} disabled={loading} onClick={() => analyze()}>
              {loading ? "Analyzing…" : "Analyze Wiring"}
            </Button>
            <Button variant="secondary" icon={Sparkles} disabled={loading} onClick={showSample}>Sample Analysis</Button>
            {(photo || sample) && <Button variant="ghost" icon={Trash2} disabled={loading} onClick={removePhoto}>Remove</Button>}
          </div>
          {error && <div className="auth-message error" style={{ marginTop: 12 }}>{error}</div>}
        </Card>
      </div>
      <input ref={inputRef} hidden type="file" accept="image/*" onChange={onFileChange} />

      <SectionTitle title="Previous Analyses" href="#previous-analyses" />
      <div id="previous-analyses" className="history-grid">
        {previousAnalyses.map((analysis) => (
          <Link key={analysis.id} href={`/photo-analysis/results/${analysis.id}`}>
            <Card className="history-card">
              <div className="history-thumb" style={{ position: "relative" }}>
                <Camera size={22} />
                <span style={{ position: "absolute", top: 9, right: 9 }}><Badge tone="red">{analysis.severity}</Badge></span>
              </div>
              <h3>{analysis.title}</h3>
              <p>{analysis.date}</p>
              <div className="history-meta">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--muted)", fontSize: 10 }}>
                  <Eye size={12} /> View <ChevronRight size={12} />
                </span>
                <Badge tone={analysis.confidence === "87%" ? "amber" : "green"}>{analysis.confidence}</Badge>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
