"use client";

import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  FileVideo,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";

import {
  AssessmentLoadError,
  AssessmentLoading,
} from "@/components/assessment/assessment-page-state";
import { usePracticalAssessment } from "@/components/assessment/assessment-provider";
import { AssessmentStepper } from "@/components/assessment/assessment-stepper";
import { Badge, Button, Card, LinkButton } from "@/components/ui";

const MAX_VIDEO_BYTES = 100_000_000;
const VIDEO_ACCEPT = ".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm";
const allowedVideoTypes = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
const allowedVideoExtensions = new Set(["mp4", "mov", "webm"]);

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function validateVideo(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedVideoTypes.has(file.type) && !allowedVideoExtensions.has(extension)) {
    return "Choose an MP4, MOV, or WebM video.";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return "The video must be 100 MB or smaller.";
  }
  if (file.size === 0) return "The selected video is empty.";
  return "";
}

export default function UploadAssessmentPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    assessment,
    loading,
    error: loadError,
    refresh,
    startAssessment,
  } = usePracticalAssessment();
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [projectName, setProjectName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!video) {
      setVideoUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(video);
    setVideoUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [video]);

  function selectVideo(file?: File) {
    if (!file) return;
    const validationError = validateVideo(file);
    if (validationError) {
      setFormError(validationError);
      setVideo(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFormError("");
    setVideo(file);
  }

  function clearVideo() {
    setVideo(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function dropVideo(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    selectVideo(event.dataTransfer.files?.[0]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTopic = topic.trim();
    const normalizedProjectName = projectName.trim();
    if (!normalizedTopic || !normalizedProjectName) {
      setFormError("Select a topic and enter your project name.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const response = await startAssessment({
        topic: normalizedTopic,
        projectName: normalizedProjectName,
        video,
      });
      router.push(
        response.assessment?.status === "completed"
          ? "/assessments/new/results"
          : "/assessments/new/questions",
      );
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : "The assessment could not be started.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function analyzeDraftVideo() {
    if (!assessment || assessment.status !== "draft" || !video) return;
    setSubmitting(true);
    setFormError("");
    try {
      await startAssessment({
        topic: assessment.topic,
        projectName: assessment.project_name,
        video,
      });
      setVideo(null);
      router.push("/assessments/new/questions");
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : "The replacement video could not be analyzed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <AssessmentLoading />;
  if (loadError) {
    return (
      <AssessmentLoadError
        message={loadError}
        retry={() => void refresh().catch(() => {})}
      />
    );
  }

  if (assessment) {
    const completed = assessment.status === "completed";
    const videoLabel = assessment.video_status === "analyzed"
      ? "Video analyzed"
      : assessment.video_status === "failed"
        ? "Video unavailable — manual answers enabled"
        : "Manual assessment without video";
    return (
      <div>
        {!completed && (
          <input
            ref={inputRef}
            id="assessment-draft-video"
            type="file"
            accept={VIDEO_ACCEPT}
            hidden
            onChange={(event) => {
              selectVideo(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        )}
        <AssessmentStepper
          currentStep={completed ? 4 : 1}
          assessmentStatus={assessment.status}
        />
        <div className="assessment-intro">
          <h1>{completed ? "Assessment completed" : "Assessment in progress"}</h1>
          <p>
            {completed
              ? "Your competency profile has already been saved. You can review the results at any time."
              : "Continue the one-time assessment you already started."}
          </p>
        </div>
        <Card className="assessment-resume-card">
          <span className={`icon-box ${completed ? "icon-green" : "icon-blue"}`}>
            {completed ? <CheckCircle2 size={22} /> : <FileVideo size={22} />}
          </span>
          <div>
            <div className="chips">
              <Badge>{assessment.topic}</Badge>
              <Badge tone={assessment.video_status === "failed" ? "amber" : "green"}>
                {videoLabel}
              </Badge>
            </div>
            <h2>{assessment.project_name}</h2>
            <p>
              {completed && assessment.overall_score !== null
                ? `Overall competency score: ${assessment.overall_score}% · Grade ${assessment.grade}`
                : "Your fixed questions and any safe AI observations are ready."}
            </p>
          </div>
          <div className="assessment-resume-actions">
            <LinkButton
              href={completed ? "/assessments/new/results" : "/assessments/new/questions"}
              icon={ArrowRight}
            >
              {completed ? "View Results" : "Continue Assessment"}
            </LinkButton>
            {!completed && (
              <Button
                type="button"
                variant="secondary"
                icon={Upload}
                disabled={submitting}
                onClick={() => inputRef.current?.click()}
              >
                {assessment.video_status === "failed"
                  ? "Retry Video"
                  : assessment.video_status === "not_provided"
                    ? "Add Video"
                    : "Replace Video"}
              </Button>
            )}
          </div>
        </Card>
        {!completed && video && (
          <Card className="assessment-draft-video-card">
            <div>
              <Badge tone="green"><FileVideo size={12} /> {video.name}</Badge>
              <span>{formatBytes(video.size)}</span>
            </div>
            <p>
              Analyzing this file replaces the draft&apos;s previous video
              observations but preserves answers you entered yourself.
            </p>
            <div className="inline-actions">
              <Button
                type="button"
                variant="ghost"
                icon={X}
                disabled={submitting}
                onClick={clearVideo}
              >
                Remove
              </Button>
              <Button
                type="button"
                icon={ArrowRight}
                disabled={submitting}
                onClick={() => void analyzeDraftVideo()}
              >
                {submitting ? "Analyzing Video…" : "Analyze & Continue"}
              </Button>
            </div>
          </Card>
        )}
        {!completed && formError && (
          <div className="auth-message error">{formError}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <AssessmentStepper currentStep={1} assessmentStatus={null} />
      <div className="assessment-intro">
        <h1>Video Practical Assessment</h1>
        <p>
          Optionally upload a short practical-work video, then complete ten fixed questions.
        </p>
      </div>

      <form onSubmit={submit}>
        <input
          ref={inputRef}
          id="assessment-video"
          type="file"
          accept={VIDEO_ACCEPT}
          hidden
          onChange={(event) => {
            selectVideo(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        {video && videoUrl ? (
          <Card className="assessment-video-card">
            <video
              src={videoUrl}
              controls
              playsInline
              aria-label={`Preview of ${video.name}`}
              className="assessment-video-player"
            />
            <div className="assessment-file-row">
              <Badge tone="green"><CheckCircle2 size={12} /> {video.name}</Badge>
              <span>{formatBytes(video.size)}</span>
              <Button
                variant="ghost"
                icon={X}
                type="button"
                disabled={submitting}
                onClick={clearVideo}
              >
                Remove
              </Button>
            </div>
          </Card>
        ) : (
          <button
            type="button"
            className={`upload-zone assessment-video-upload ${dragging ? "is-dragging" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={dropVideo}
          >
            <span className="upload-icon"><Upload size={25} /></span>
            <h2>Upload a practical work video <small>Optional</small></h2>
            <p>MP4, MOV, or WebM · maximum 100 MB</p>
            <span className="button button-secondary">Choose Video</span>
            <small className="assessment-skip-note">
              No video? Continue below and answer all questions manually.
            </small>
          </button>
        )}

        <div className="assessment-form-grid">
          <label className="field">
            <span>Topic / Category</span>
            <select
              required
              value={topic}
              disabled={submitting}
              onChange={(event) => setTopic(event.target.value)}
            >
              <option value="">Select a topic</option>
              <option>House Wiring</option>
              <option>Motor Starter</option>
              <option>Three Phase</option>
              <option>Lighting Circuit</option>
              <option>Electrical Installation</option>
              <option>Testing and Verification</option>
            </select>
          </label>
          <label className="field">
            <span>Project Name</span>
            <input
              required
              maxLength={160}
              value={projectName}
              disabled={submitting}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="e.g., Final Lab Project - House Wiring"
            />
          </label>
        </div>

        <div className="assessment-privacy-note">
          <ShieldCheck size={17} />
          <p>
            Your video is temporarily sent to Gemini for analysis. The backend does not store the raw video in Supabase and asks Gemini to delete its temporary copy afterward; only metadata, observations, answers, and results are retained.
          </p>
        </div>

        {formError && <div className="auth-message error">{formError}</div>}
        <div className="wizard-actions assessment-first-actions">
          <span className="assessment-manual-note">
            {video ? "Your video will be analyzed before Step 2." : "You are continuing without a video."}
          </span>
          <Button type="submit" icon={ArrowRight} disabled={submitting}>
            {submitting
              ? video
                ? "Analyzing Video…"
                : "Starting Assessment…"
              : "Next: Review Questions"}
          </Button>
        </div>
      </form>
    </div>
  );
}
