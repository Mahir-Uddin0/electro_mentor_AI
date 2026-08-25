"use client";

import { useParams } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  Download,
  HardHat,
  ImageOff,
  ImagePlus,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { RecentPhotoAnalyses } from "@/components/photo-analysis/recent-analyses";
import {
  Badge,
  Button,
  Card,
  LinkButton,
  PageHeading,
  SectionTitle,
} from "@/components/ui";
import type {
  PhotoAnalysisResult,
  PhotoFaultSeverity,
} from "@/lib/api/client";
import {
  getStoredPhotoAnalysis,
  listStoredPhotoAnalyses,
} from "@/lib/photo-analysis";

function severityTone(
  severity: PhotoFaultSeverity,
): "red" | "amber" | "blue" {
  if (severity === "critical" || severity === "high") return "red";
  if (severity === "medium") return "amber";
  return "blue";
}

function severityLabel(severity: PhotoFaultSeverity) {
  return `${severity.slice(0, 1).toUpperCase()}${severity.slice(1)}`;
}

function GuidanceCard({ analysis }: { analysis: PhotoAnalysisResult }) {
  const { upload_guidance: guidance } = analysis;
  if (
    !guidance.reason &&
    guidance.recommended_photos.length === 0 &&
    guidance.photo_tips.length === 0
  ) {
    return null;
  }

  return (
    <Card className="detail-section">
      <h2><ImagePlus size={17} /> Photo guidance</h2>
      {guidance.reason && <p style={{ color: "var(--muted)" }}>{guidance.reason}</p>}
      {guidance.recommended_photos.length > 0 && (
        <>
          <strong style={{ display: "block", margin: "14px 0 7px", fontSize: 12 }}>
            Upload these views
          </strong>
          <ul className="two-column-list">
            {guidance.recommended_photos.map((photo) => <li key={photo}>{photo}</li>)}
          </ul>
        </>
      )}
      {guidance.photo_tips.length > 0 && (
        <>
          <strong style={{ display: "block", margin: "14px 0 7px", fontSize: 12 }}>
            Photo tips
          </strong>
          <ul className="two-column-list">
            {guidance.photo_tips.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </>
      )}
    </Card>
  );
}

function FaultResult({ analysis }: { analysis: PhotoAnalysisResult }) {
  const fault = analysis.primary_fault;
  if (!fault) {
    return (
      <>
        <div className="alert alert-amber" style={{ marginBottom: 14 }}>
          <AlertTriangle size={20} />
          <div><strong>Analysis completed</strong><p>{analysis.summary}</p></div>
        </div>
        <GuidanceCard analysis={analysis} />
      </>
    );
  }

  const urgent = fault.severity === "critical" || fault.severity === "high";
  return (
    <>
      <div className={`alert ${urgent ? "alert-red" : "alert-amber"}`} style={{ marginBottom: 14 }}>
        <AlertTriangle size={20} />
        <div>
          <strong>{severityLabel(fault.severity)} Severity Fault Detected</strong>
          <p>{analysis.summary}</p>
        </div>
      </div>

      <Card className="result-hero">
        <div className="result-title">
          <div><h1>{fault.title}</h1><p>{fault.description}</p></div>
          <div className="chips">
            <Badge tone="green">{Math.round(fault.confidence)}% Confidence</Badge>
            <Badge tone={severityTone(fault.severity)}>{severityLabel(fault.severity)} Severity</Badge>
          </div>
        </div>

        <div className="result-info-grid">
          <div className="result-info">
            <span><MapPin size={12} /> Location</span>
            <strong>{fault.location || "Location not clear from the photo"}</strong>
          </div>
          <div className="result-info">
            <span><AlertTriangle size={12} /> Possible cause</span>
            <strong>{fault.possible_cause}</strong>
          </div>
        </div>

        {fault.repair_steps.length > 0 && (
          <div className="alert alert-green">
            <Wrench size={19} />
            <div style={{ width: "100%" }}>
              <strong>Repair Recommendation</strong>
              <ol className="step-list">
                {fault.repair_steps.map((step, index) => (
                  <li key={`${index}-${step}`}><i>{index + 1}</i><span>{step}</span></li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {fault.safety_warning && (
          <div className="alert alert-red">
            <AlertTriangle size={19} />
            <div><strong>Safety Warning</strong><p>{fault.safety_warning}</p></div>
          </div>
        )}

        <div className="result-info-grid">
          <div className="result-info">
            <span><ShieldCheck size={12} /> Required PPE</span>
            <div className="chips" style={{ marginTop: 8 }}>
              {fault.required_ppe.length > 0
                ? fault.required_ppe.map((item) => <Badge key={item} tone="blue">{item}</Badge>)
                : <span style={{ color: "var(--muted)", fontSize: 11 }}>Consult a qualified electrician.</span>}
            </div>
          </div>
          <div className="result-info">
            <span><HardHat size={12} /> Required tools</span>
            <div className="chips" style={{ marginTop: 8 }}>
              {fault.required_tools.length > 0
                ? fault.required_tools.map((item) => <Badge key={item} tone="amber">{item}</Badge>)
                : <span style={{ color: "var(--muted)", fontSize: 11 }}>No tools identified from the image.</span>}
            </div>
          </div>
        </div>
        {fault.estimated_repair_time && (
          <div className="result-info">
            <span><Clock3 size={12} /> Estimated repair time</span>
            <strong>{fault.estimated_repair_time}</strong>
          </div>
        )}
      </Card>

      {analysis.other_faults.length > 0 && (
        <>
          <SectionTitle title="Other Faults Detected" />
          <div className="result-info-grid">
            {analysis.other_faults.map((otherFault, index) => (
              <Card className="detail-section" key={`${index}-${otherFault.title}`}>
                <div className="result-title">
                  <div><h2>{otherFault.title}</h2></div>
                  <div className="chips">
                    <Badge tone="green">{Math.round(otherFault.confidence)}%</Badge>
                    <Badge tone={severityTone(otherFault.severity)}>
                      {severityLabel(otherFault.severity)}
                    </Badge>
                  </div>
                </div>
                <p style={{ color: "var(--muted)", fontSize: 11 }}>{otherFault.description}</p>
                {otherFault.location && (
                  <p style={{ color: "var(--muted)", fontSize: 11 }}>
                    <MapPin size={12} style={{ verticalAlign: "middle", marginRight: 5 }} />
                    {otherFault.location}
                  </p>
                )}
                <div className="alert alert-green" style={{ marginTop: 12 }}>
                  <Wrench size={15} /><p>{otherFault.recommendation}</p>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
      <div style={{ marginTop: 14 }}><GuidanceCard analysis={analysis} /></div>
    </>
  );
}

function ClearResult({ analysis }: { analysis: PhotoAnalysisResult }) {
  const insufficient = analysis.outcome === "insufficient_image";
  return (
    <>
      <div className={`alert ${insufficient ? "alert-amber" : "alert-green"}`} style={{ marginBottom: 14 }}>
        {insufficient ? <ImageOff size={20} /> : <CheckCircle2 size={20} />}
        <div>
          <strong>{insufficient ? "The image could not be assessed reliably" : "No visible faults detected"}</strong>
          <p>{analysis.summary}</p>
        </div>
      </div>
      <Card className="result-hero">
        <div className="result-title">
          <div>
            <h1>{insufficient ? "A clearer photo is needed" : "Visual check complete"}</h1>
            <p>
              {insufficient
                ? analysis.upload_guidance.reason ?? "Important wiring details were not visible enough for a reliable assessment."
                : "No fault was visible in this image. This visual result does not replace electrical testing by a qualified person."}
            </p>
          </div>
          <Badge tone={insufficient ? "amber" : "green"}>
            {insufficient ? "Not analyzable" : "No visible fault"}
          </Badge>
        </div>
      </Card>
      <div style={{ marginTop: 14 }}><GuidanceCard analysis={analysis} /></div>
    </>
  );
}

export default function PhotoAnalysisResultPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const ownerId = user?.id ?? "preview";
  const [analysis, setAnalysis] = useState<PhotoAnalysisResult | null | undefined>();
  const [recentAnalyses, setRecentAnalyses] = useState<PhotoAnalysisResult[]>([]);

  useEffect(() => {
    setAnalysis(getStoredPhotoAnalysis(ownerId, params.id));
    setRecentAnalyses(listStoredPhotoAnalyses(ownerId));
  }, [ownerId, params.id]);

  if (analysis === undefined) {
    return <div className="full-loader" style={{ minHeight: 360, background: "transparent" }}><span className="spinner" /> Loading analysis…</div>;
  }

  if (!analysis) {
    return (
      <>
        <PageHeading title="AI Fault Detection" eyebrow={`Analysis ${params.id}`} />
        <Card className="empty-state">
          <span className="empty-icon"><ImageOff size={28} /></span>
          <h2>Analysis report unavailable</h2>
          <p>
            Photo reports are retained only for the current signed-in user and browser session. Upload the photo again to run a new analysis.
          </p>
          <LinkButton href="/photo-analysis" icon={RotateCcw}>Start New Analysis</LinkButton>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeading title="AI Fault Detection" eyebrow={`Analysis ${analysis.analysis_id}`} />

      {analysis.outcome === "faults_detected"
        ? <FaultResult analysis={analysis} />
        : <ClearResult analysis={analysis} />}

      <div className="inline-actions" style={{ justifyContent: "flex-start", marginTop: 14 }}>
        <Button icon={Download} onClick={() => window.print()}>Save Report</Button>
        {analysis.outcome === "faults_detected" && (
          <LinkButton href="/guides" variant="secondary" icon={BookOpen}>Related Guide</LinkButton>
        )}
        <LinkButton href="/photo-analysis" variant="secondary" icon={RotateCcw}>New Analysis</LinkButton>
      </div>

      <RecentPhotoAnalyses analyses={recentAnalyses} />
    </>
  );
}
