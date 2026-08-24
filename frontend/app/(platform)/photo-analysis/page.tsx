"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
  ChevronRight,
  Eye,
  ImagePlus,
  Upload,
} from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { Badge, Button, Card, PageHeading, SectionTitle } from "@/components/ui";

const previousAnalyses = [
  { id: "AN-1039", title: "Exposed Live Wire", date: "2025-01-10", severity: "Critical", confidence: "99%" },
  { id: "AN-1040", title: "Overloaded Circuit", date: "2025-01-08", severity: "High", confidence: "91%" },
  { id: "AN-1041", title: "Missing Ground Connection", date: "2025-01-05", severity: "High", confidence: "87%" },
  { id: "AN-1038", title: "Loose Neutral Wire", date: "2025-01-02", severity: "High", confidence: "96%" },
];

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export default function PhotoAnalysisPage() {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  function openReview(file: File) {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Choose a JPG, PNG, HEIC, or other image file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("The image must be smaller than 20 MB.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    sessionStorage.setItem("electromentor.photo.url", objectUrl);
    sessionStorage.setItem("electromentor.photo.name", file.name);
    sessionStorage.setItem("electromentor.photo.size", String(file.size));
    sessionStorage.setItem("electromentor.photo.type", file.type || "image/*");
    router.push("/photo-analysis/review");
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) openReview(file);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) openReview(file);
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
            <Button variant="secondary" icon={Camera} onClick={() => cameraInput.current?.click()}>
              Camera Upload
            </Button>
            <Button icon={ImagePlus} onClick={() => galleryInput.current?.click()}>
              Gallery Upload
            </Button>
          </div>
          <small style={{ marginTop: 15, color: "var(--muted)", fontSize: 10 }}>
            Accepted formats: JPG, PNG, HEIC · Max 20MB
          </small>
          {error && <span className="auth-message error" style={{ marginTop: 12 }}>{error}</span>}
          <input ref={cameraInput} hidden type="file" accept="image/*" capture="environment" onChange={onFileChange} />
          <input ref={galleryInput} hidden type="file" accept="image/*" onChange={onFileChange} />
        </div>
      </Card>

      <SectionTitle title="Previous Analyses" href="#previous-analyses" />
      <div id="previous-analyses" className="history-grid">
        {previousAnalyses.map((analysis) => (
          <Link key={analysis.id} href={`/photo-analysis/results/${analysis.id}`}>
            <Card className="history-card">
              <div className="history-thumb" style={{ position: "relative" }}>
                <Upload size={22} />
                <span style={{ position: "absolute", top: 9, right: 9 }}>
                  <Badge tone="red">{analysis.severity}</Badge>
                </span>
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
