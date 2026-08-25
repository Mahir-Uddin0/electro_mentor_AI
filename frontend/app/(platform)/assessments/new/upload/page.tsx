"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Eye, Play, Upload, X } from "lucide-react";

import { Badge, Button, Card, LinkButton } from "@/components/ui";

const previousAssessments = [
  { score: 78, topic: "House Wiring", date: "2 days ago", title: "Lab Project 1", grade: "C" },
  { score: 85, topic: "Motor Starter", date: "7 days ago", title: "Mid-term Assessment", grade: "B" },
];

export default function UploadAssessmentPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("WhatsApp Video 2026-07-21 at 21.09.08.mp4");
  const [fileSize, setFileSize] = useState("2.4 MB");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [projectName, setProjectName] = useState("");

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  function selectVideo(file?: File) {
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setFileSize(`${Math.max(file.size / 1024 / 1024, 0.1).toFixed(1)} MB`);
  }

  function clearVideo() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setFileName("");
    setFileSize("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div style={{ marginBottom: 22, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: "clamp(24px, 2.5vw, 32px)", letterSpacing: "-0.04em" }}>
          Video Practical Assessment
        </h1>
        <p style={{ margin: "5px 0 0", color: "var(--muted)" }}>
          Upload a 2-minute video of your practical work for AI-powered assessment
        </p>
      </div>

      <input
        ref={inputRef}
        id="assessment-video"
        type="file"
        accept="video/*"
        hidden
        onChange={(event) => selectVideo(event.target.files?.[0])}
      />

      {fileName ? (
        <>
          <div className="video-preview">
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                playsInline
                aria-label={`Preview of ${fileName}`}
                style={{ width: "100%", height: "100%", minHeight: 290, objectFit: "cover" }}
              />
            ) : (
              <button
                className="play-button"
                type="button"
                aria-label="Choose a different assessment video"
                onClick={() => inputRef.current?.click()}
              >
                <Play size={28} fill="currentColor" />
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12 }}>
            <Badge tone="green"><CheckCircle2 size={12} /> {fileName}</Badge>
            <span style={{ color: "var(--muted)", fontSize: 11 }}>{fileSize}</span>
            <button
              className="icon-button"
              type="button"
              aria-label="Remove uploaded video"
              onClick={clearVideo}
              style={{ marginLeft: "auto" }}
            >
              <X size={16} />
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="upload-zone"
          onClick={() => inputRef.current?.click()}
          style={{ width: "100%", color: "var(--text)", cursor: "pointer" }}
        >
          <span className="upload-icon"><Upload size={25} /></span>
          <h2>Upload your practical work video</h2>
          <p>MP4, MOV or WebM · up to 2 minutes</p>
          <span className="button button-primary">Choose Video</span>
        </button>
      )}

      <div className="assessment-form-grid">
        <label className="field">
          <span>Topic / Category</span>
          <select value={topic} onChange={(event) => setTopic(event.target.value)}>
            <option value="">Select a topic</option>
            <option>House Wiring</option>
            <option>Motor Starter</option>
            <option>Three Phase</option>
            <option>Lighting Circuit</option>
          </select>
        </label>
        <label className="field">
          <span>Project Name</span>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="e.g., Final Lab Project - House Wiring"
          />
        </label>
      </div>

      <div className="wizard-actions" style={{ justifyContent: "flex-end" }}>
        <LinkButton href="/assessments/new/questions" icon={ArrowRight}>
          Next: Add Questions
        </LinkButton>
      </div>

      <h2 style={{ margin: "28px 0 14px", fontSize: 16 }}>Previous Assessments</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {previousAssessments.map((assessment) => (
          <Card key={assessment.title} className="question-card">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span
                style={{
                  width: 42,
                  height: 42,
                  display: "grid",
                  placeItems: "center",
                  flex: "0 0 auto",
                  color: "var(--primary)",
                  border: "3px solid var(--primary)",
                  borderRadius: "50%",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {assessment.score}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7 }}>
                  <Badge>{assessment.topic}</Badge>
                  <span style={{ color: "var(--muted)", fontSize: 10 }}>{assessment.date}</span>
                </div>
                <strong style={{ display: "block", margin: "5px 0", fontSize: 13 }}>{assessment.title}</strong>
                <div style={{ display: "flex", gap: 6 }}>
                  <Badge tone="amber">Grade: {assessment.grade}</Badge>
                  <Badge tone="green">✓ PASSED</Badge>
                </div>
              </div>
              <Button variant="secondary" icon={Eye} aria-label={`View ${assessment.title}`}>View</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
