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
import { useLanguage } from "@/components/language-provider";
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
  const { t } = useLanguage();
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
      <h2><ImagePlus size={17} /> {t("Photo guidance")}</h2>
      {guidance.reason && <p style={{ color: "var(--muted)" }}>{guidance.reason}</p>}
      {guidance.recommended_photos.length > 0 && (
        <>
          <strong style={{ display: "block", margin: "14px 0 7px", fontSize: 12 }}>
            {t("Upload these views")}
          </strong>
          <ul className="two-column-list">
            {guidance.recommended_photos.map((photo) => <li key={photo}>{photo}</li>)}
          </ul>
        </>
      )}
      {guidance.photo_tips.length > 0 && (
        <>
          <strong style={{ display: "block", margin: "14px 0 7px", fontSize: 12 }}>
            {t("Photo tips")}
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
  const { locale, t } = useLanguage();
  const fault = analysis.primary_fault;
  if (!fault) {
    return (
      <>
        <div className="alert alert-amber" style={{ marginBottom: 14 }}>
          <AlertTriangle size={20} />
          <div><strong>{t("Analysis completed")}</strong><p>{analysis.summary}</p></div>
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
          <strong>{t("{{severity}} Severity Fault Detected", { severity: t(severityLabel(fault.severity)) })}</strong>
          <p>{analysis.summary}</p>
        </div>
      </div>

      <Card className="result-hero">
        <div className="result-title">
          <div><h1>{fault.title}</h1><p>{fault.description}</p></div>
          <div className="chips">
            <Badge tone="green">{new Intl.NumberFormat(locale).format(Math.round(fault.confidence))}% {t("Confidence")}</Badge>
            <Badge tone={severityTone(fault.severity)}>{t(severityLabel(fault.severity))} {t("Severity")}</Badge>
          </div>
        </div>

        <div className="result-info-grid">
          <div className="result-info">
            <span><MapPin size={12} /> {t("Location")}</span>
            <strong>{fault.location || t("Location not clear from the photo")}</strong>
          </div>
          <div className="result-info">
            <span><AlertTriangle size={12} /> {t("Possible Cause")}</span>
            <strong>{fault.possible_cause}</strong>
          </div>
        </div>

        {fault.repair_steps.length > 0 && (
          <div className="alert alert-green">
            <Wrench size={19} />
            <div style={{ width: "100%" }}>
              <strong>{t("Repair Recommendation")}</strong>
              <ol className="step-list">
                {fault.repair_steps.map((step, index) => (
                  <li key={`${index}-${step}`}><i>{new Intl.NumberFormat(locale).format(index + 1)}</i><span>{step}</span></li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {fault.safety_warning && (
          <div className="alert alert-red">
            <AlertTriangle size={19} />
            <div><strong>{t("Safety Warning")}</strong><p>{fault.safety_warning}</p></div>
          </div>
        )}

        <div className="result-info-grid">
          <div className="result-info">
            <span><ShieldCheck size={12} /> {t("Required PPE")}</span>
            <div className="chips" style={{ marginTop: 8 }}>
              {fault.required_ppe.length > 0
                ? fault.required_ppe.map((item) => <Badge key={item} tone="blue">{item}</Badge>)
                : <span style={{ color: "var(--muted)", fontSize: 11 }}>{t("Consult a qualified electrician.")}</span>}
            </div>
          </div>
          <div className="result-info">
            <span><HardHat size={12} /> {t("Required Tools")}</span>
            <div className="chips" style={{ marginTop: 8 }}>
              {fault.required_tools.length > 0
                ? fault.required_tools.map((item) => <Badge key={item} tone="amber">{item}</Badge>)
                : <span style={{ color: "var(--muted)", fontSize: 11 }}>{t("No tools identified from the image.")}</span>}
            </div>
          </div>
        </div>
        {fault.estimated_repair_time && (
          <div className="result-info">
            <span><Clock3 size={12} /> {t("Estimated repair time")}</span>
            <strong>{fault.estimated_repair_time}</strong>
          </div>
        )}
      </Card>

      {analysis.other_faults.length > 0 && (
        <>
          <SectionTitle title={t("Other Faults Detected")} />
          <div className="result-info-grid">
            {analysis.other_faults.map((otherFault, index) => (
              <Card className="detail-section" key={`${index}-${otherFault.title}`}>
                <div className="result-title">
                  <div><h2>{otherFault.title}</h2></div>
                  <div className="chips">
                    <Badge tone="green">{new Intl.NumberFormat(locale).format(Math.round(otherFault.confidence))}%</Badge>
                    <Badge tone={severityTone(otherFault.severity)}>
                      {t(severityLabel(otherFault.severity))}
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
  const { t } = useLanguage();
  const insufficient = analysis.outcome === "insufficient_image";
  return (
    <>
      <div className={`alert ${insufficient ? "alert-amber" : "alert-green"}`} style={{ marginBottom: 14 }}>
        {insufficient ? <ImageOff size={20} /> : <CheckCircle2 size={20} />}
        <div>
          <strong>{insufficient ? t("The image could not be assessed reliably") : t("No visible faults detected")}</strong>
          <p>{analysis.summary}</p>
        </div>
      </div>
      <Card className="result-hero">
        <div className="result-title">
          <div>
            <h1>{insufficient ? t("A clearer photo is needed") : t("Visual check complete")}</h1>
            <p>
              {insufficient
                ? analysis.upload_guidance.reason ?? t("Important wiring details were not visible enough for a reliable assessment.")
                : t("No fault was visible in this image. This visual result does not replace electrical testing by a qualified person.")}
            </p>
          </div>
          <Badge tone={insufficient ? "amber" : "green"}>
            {insufficient ? t("Not analyzable") : t("No visible fault")}
          </Badge>
        </div>
      </Card>
      <div style={{ marginTop: 14 }}><GuidanceCard analysis={analysis} /></div>
    </>
  );
}

export default function PhotoAnalysisResultPage() {
  const params = useParams<{ id: string }>();
  const { t } = useLanguage();
  const { user } = useAuth();
  const ownerId = user?.id ?? "preview";
  const [analysis, setAnalysis] = useState<PhotoAnalysisResult | null | undefined>();
  const [recentAnalyses, setRecentAnalyses] = useState<PhotoAnalysisResult[]>([]);

  useEffect(() => {
    setAnalysis(getStoredPhotoAnalysis(ownerId, params.id));
    setRecentAnalyses(listStoredPhotoAnalyses(ownerId));
  }, [ownerId, params.id]);

  if (analysis === undefined) {
    return <div className="full-loader" style={{ minHeight: 360, background: "transparent" }}><span className="spinner" /> {t("Loading analysis…")}</div>;
  }

  if (!analysis) {
    return (
      <>
        <PageHeading title={t("AI Fault Detection")} eyebrow={`${t("Analysis")} ${params.id}`} />
        <Card className="empty-state">
          <span className="empty-icon"><ImageOff size={28} /></span>
          <h2>{t("Analysis report unavailable")}</h2>
          <p>
            {t("Photo reports are retained only for the current signed-in user and browser session. Upload the photo again to run a new analysis.")}
          </p>
          <LinkButton href="/photo-analysis" icon={RotateCcw}>{t("Start New Analysis")}</LinkButton>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeading title={t("AI Fault Detection")} eyebrow={`${t("Analysis")} ${analysis.analysis_id}`} />

      {analysis.outcome === "faults_detected"
        ? <FaultResult analysis={analysis} />
        : <ClearResult analysis={analysis} />}

      <div className="inline-actions" style={{ justifyContent: "flex-start", marginTop: 14 }}>
        <Button icon={Download} onClick={() => window.print()}>{t("Save Report")}</Button>
        {analysis.outcome === "faults_detected" && (
          <LinkButton href="/guides" variant="secondary" icon={BookOpen}>{t("Related Guide")}</LinkButton>
        )}
        <LinkButton href="/photo-analysis" variant="secondary" icon={RotateCcw}>{t("New Analysis")}</LinkButton>
      </div>

      <RecentPhotoAnalyses analyses={recentAnalyses} />
    </>
  );
}
