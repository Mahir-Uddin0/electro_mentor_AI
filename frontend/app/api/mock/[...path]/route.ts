import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");
  const responses: Record<string, object> = {
    dashboard: { greeting: "Welcome back, Prince!" },
    guides: { total: 24 },
    tasks: { total: 4, completed: 1 },
    "chat/history": { user_id: "preview-user", messages: [] },
  };
  return NextResponse.json(responses[path] ?? { ok: true, path });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");
  const body = (await request.json().catch(() => ({}))) as Record<string, string>;
  if (path === "chat") {
    return NextResponse.json({
      answer:
        "Start by isolating the supply, verify the circuit is de-energized, and inspect each connection against the wiring guide. This is a preview response from the frontend mock API.",
      sources: [{ title: "Electrical workshop safety guide" }],
    });
  }
  if (path === "photo-analysis") {
    return NextResponse.json({ analysisId: "AN-1042", status: "complete" });
  }
  if (path === "checklists/generate") {
    return NextResponse.json({ id: "CHK-204", title: body.task ?? "Safety checklist" });
  }
  return NextResponse.json({ ok: true, path, received: body });
}
