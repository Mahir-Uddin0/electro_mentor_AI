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
import { useLanguage } from "@/components/language-provider";
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
  const { t } = useLanguage();
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
      setFormError(t(validationError));
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
    if (!video) {
      setFormError(t("Upload a practical-work video to continue."));
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const response = await startAssessment({ video });
      router.push(
        response.assessment?.status === "completed"
          ? "/assessments/new/results"
          : "/assessments/new/questions",
      );
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : t("Your practical assessment could not be started."),
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
      await startAssessment({ video });
      setVideo(null);
      router.push("/assessments/new/questions");
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : t("The replacement work video could not be analyzed."),
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

  if (assessment?.status === "draft") {
    const answersGenerated = assessment.video_status === "answers_generated";
    const videoLabel = answersGenerated
      ? "Video answers generated"
      : "Assessment questions generated";
    return (
      <div>
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
        <AssessmentStepper
          currentStep={1}
          assessmentStatus={assessment.status}
          videoStatus={assessment.video_status}
        />
        <div className="assessment-intro">
          <h1>{t("Practical assessment in progress")}</h1>
          <p>{t("Continue the assessment generated from your uploaded practical-work video.")}</p>
        </div>
        <Card className="assessment-resume-card">
          <span className="icon-box icon-blue">
            <FileVideo size={22} />
          </span>
          <div>
            <div className="chips">
              <Badge tone="green">{t(videoLabel)}</Badge>
            </div>
            <h2>{t("Your work assessment")}</h2>
            <p>
              {answersGenerated
                ? t("Gemini's video-based answers are ready for your review.")
                : t("Ten work-specific questions are ready for review.")}
            </p>
          </div>
          <div className="assessment-resume-actions">
            <LinkButton
              href={answersGenerated
                ? "/assessments/new/answers"
                : "/assessments/new/questions"}
              icon={ArrowRight}
            >
              {t("Continue Assessment")}
            </LinkButton>
            <Button
              type="button"
              variant="secondary"
              icon={Upload}
              disabled={submitting}
              onClick={() => inputRef.current?.click()}
            >
              {t("Replace Video")}
            </Button>
          </div>
        </Card>
        {video && (
          <Card className="assessment-draft-video-card">
            <div>
              <Badge tone="green"><FileVideo size={12} /> {video.name}</Badge>
              <span>{formatBytes(video.size)}</span>
            </div>
            <p>
              {t("Submitting this file replaces the draft's generated questions and answers with a new assessment based on this video.")}
            </p>
            <div className="inline-actions">
              <Button
                type="button"
                variant="ghost"
                icon={X}
                disabled={submitting}
                onClick={clearVideo}
              >
                {t("Remove")}
              </Button>
              <Button
                type="button"
                icon={ArrowRight}
                disabled={submitting}
                onClick={() => void analyzeDraftVideo()}
              >
                {submitting ? t("Generating Questions…") : t("Replace & Continue")}
              </Button>
            </div>
          </Card>
        )}
        {formError && (
          <div className="auth-message error">{formError}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <AssessmentStepper
        currentStep={1}
        assessmentStatus={null}
        videoStatus={null}
      />
      <div className="assessment-intro">
        <h1>{t("Video Practical Assessment")}</h1>
        <p>
          {t("Upload a video of your practical electrical work. Gemini will create ten questions tailored to the work it can observe.")}
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
              aria-label={`${t("Preview")} ${video.name}`}
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
                {t("Remove")}
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
            <h2>{t("Upload your practical-work video")} <small>{t("Required")}</small></h2>
            <p>{t("MP4, MOV, or WebM · maximum 100 MB")}</p>
            <span className="button button-secondary">{t("Choose Video")}</span>
          </button>
        )}

        <div className="assessment-privacy-note">
          <ShieldCheck size={17} />
          <p>
            {t("Your video is stored in a private Supabase bucket so you can complete each stage, and is sent to Gemini through the authenticated backend for analysis. It is never exposed through a public video URL.")}
          </p>
        </div>

        {formError && <div className="auth-message error">{formError}</div>}
        <div className="wizard-actions assessment-first-actions">
          <span className="assessment-manual-note">
            {video
              ? t("Gemini will generate ten assessment questions from this video.")
              : t("A practical-work video is required to begin.")}
          </span>
          <Button type="submit" icon={ArrowRight} disabled={submitting || !video}>
            {submitting ? t("Generating Questions…") : t("Next: Review Questions")}
          </Button>
        </div>
      </form>
    </div>
  );
}
