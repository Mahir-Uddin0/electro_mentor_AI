"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BookOpen, Download, FileWarning, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Badge,
  Button,
  Card,
  LinkButton,
  PageHeading,
} from "@/components/ui";
import { frontendApi, type GuideDocument } from "@/lib/api/client";

function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function GuidePdfPage() {
  const params = useParams<{ id: string }>();
  const [guide, setGuide] = useState<GuideDocument | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    void (async () => {
      try {
        const { documents } = await frontendApi.listGuides();
        const selected = documents.find((item) => item.id === params.id);
        if (!selected) throw new Error("Guide not found.");
        const blob = await frontendApi.getGuideFile(selected.id);
        objectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setGuide(selected);
        setPdfUrl(objectUrl);
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "The guide PDF could not be opened.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [params.id]);

  if (loading) {
    return (
      <div className="full-loader" style={{ minHeight: 420, background: "transparent" }}>
        <span className="spinner" /> Opening guide PDF…
      </div>
    );
  }

  if (!guide || !pdfUrl) {
    return (
      <>
        <PageHeading title="Wiring & Circuit Guide Library" />
        <Card className="empty-state">
          <span className="empty-icon"><FileWarning size={28} /></span>
          <h2>Guide unavailable</h2>
          <p>{error || "This guide could not be found."}</p>
          <LinkButton href="/guides" icon={RotateCcw}>
            Back to Guide Library
          </LinkButton>
        </Card>
      </>
    );
  }

  return (
    <>
      <Link
        href="/guides"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 16,
          color: "var(--muted)",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        <ArrowLeft size={14} /> Back to Guide Library
      </Link>

      <PageHeading
        title={guide.title}
        eyebrow={guide.category}
        description={guide.description}
        action={
          <Button icon={Download} onClick={() => downloadUrl(pdfUrl, guide.filename)}>
            Download PDF
          </Button>
        }
      />

      <div className="chips" style={{ marginBottom: 14 }}>
        <Badge tone="blue"><BookOpen size={12} /> PDF guide</Badge>
        {guide.page_count && <Badge tone="gray">{guide.page_count} pages</Badge>}
      </div>

      <Card className="pdf-viewer-card">
        <iframe
          className="pdf-viewer"
          src={pdfUrl}
          title={`${guide.title} PDF`}
        />
      </Card>
    </>
  );
}
