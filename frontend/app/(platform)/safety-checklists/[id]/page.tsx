"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, FileWarning, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Badge,
  Button,
  Card,
  LinkButton,
  PageHeading,
} from "@/components/ui";
import {
  frontendApi,
  type SafetyChecklistDocument,
} from "@/lib/api/client";

function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function SafetyChecklistPdfPage() {
  const params = useParams<{ id: string }>();
  const [document, setDocument] = useState<SafetyChecklistDocument | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    void (async () => {
      try {
        const { documents } = await frontendApi.listSafetyChecklists();
        const selected = documents.find((item) => item.id === params.id);
        if (!selected) throw new Error("Safety checklist not found.");
        const blob = await frontendApi.getSafetyChecklistFile(selected.id);
        objectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setDocument(selected);
        setPdfUrl(objectUrl);
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "The safety-checklist PDF could not be opened.",
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
        <span className="spinner" /> Opening safety-checklist PDF…
      </div>
    );
  }

  if (!document || !pdfUrl) {
    return (
      <>
        <PageHeading title="Safety Checklist" />
        <Card className="empty-state">
          <span className="empty-icon"><FileWarning size={28} /></span>
          <h2>PDF unavailable</h2>
          <p>{error || "This safety checklist could not be found."}</p>
          <LinkButton href="/safety-checklists" icon={RotateCcw}>
            Back to Safety Checklists
          </LinkButton>
        </Card>
      </>
    );
  }

  return (
    <>
      <Link
        href="/safety-checklists"
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
        <ArrowLeft size={14} /> Back to Safety Checklists
      </Link>

      <PageHeading
        title={document.title}
        eyebrow={document.category}
        description={document.description}
        action={
          <Button
            icon={Download}
            onClick={() => downloadUrl(pdfUrl, document.filename)}
          >
            Download PDF
          </Button>
        }
      />

      <div className="chips" style={{ marginBottom: 14 }}>
        <Badge tone="blue">PDF</Badge>
        {document.page_count && (
          <Badge tone="gray">{document.page_count} pages</Badge>
        )}
      </div>

      <Card className="pdf-viewer-card">
        <iframe
          className="pdf-viewer"
          src={pdfUrl}
          title={`${document.title} PDF`}
        />
      </Card>
    </>
  );
}
