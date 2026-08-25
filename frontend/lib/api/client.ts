import {
  getFreshAccessToken,
  invalidateBrowserSession,
} from "@/lib/supabase/session";

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:8000";
const useMockApi = process.env.NEXT_PUBLIC_USE_MOCK_API !== "false";
const useMockChatApi = process.env.NEXT_PUBLIC_USE_MOCK_CHAT_API === "true";
const useMockPhotoApi = process.env.NEXT_PUBLIC_USE_MOCK_PHOTO_API === "true";
const useMockChecklistApi =
  process.env.NEXT_PUBLIC_USE_MOCK_CHECKLIST_API === "true";
const useMockGuideApi = process.env.NEXT_PUBLIC_USE_MOCK_GUIDE_API === "true";
const useMockTaskApi = process.env.NEXT_PUBLIC_USE_MOCK_TASK_API === "true";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export type ConversationRole = "user" | "assistant";

export type ConversationSource = {
  title?: string;
  source?: string;
  page?: number | null;
  [key: string]: unknown;
};

export type ConversationMessage = {
  id: string;
  conversation_id: string;
  role: ConversationRole;
  content: string;
  created_at: string;
  sources?: ConversationSource[];
};

export type ConversationSummary = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message?: string | null;
  message_count?: number;
};

export type ConversationDetail = ConversationSummary & {
  messages: ConversationMessage[];
};

export type SendConversationMessageResponse = {
  conversation_id: string;
  user_message: ConversationMessage;
  assistant_message: ConversationMessage;
  sources?: ConversationSource[];
};

export type PhotoAnalysisOutcome =
  | "faults_detected"
  | "no_visible_faults"
  | "insufficient_image";

export type PhotoFaultSeverity = "critical" | "high" | "medium" | "low";

export type PrimaryPhotoFault = {
  title: string;
  description: string;
  severity: PhotoFaultSeverity;
  confidence: number;
  location: string;
  possible_cause: string;
  repair_steps: string[];
  safety_warning: string;
  required_ppe: string[];
  required_tools: string[];
  estimated_repair_time: string;
};

export type OtherPhotoFault = {
  title: string;
  description: string;
  severity: PhotoFaultSeverity;
  confidence: number;
  location: string;
  recommendation: string;
};

export type PhotoAnalysisResult = {
  analysis_id: string;
  status: "completed";
  outcome: PhotoAnalysisOutcome;
  summary: string;
  primary_fault: PrimaryPhotoFault | null;
  other_faults: OtherPhotoFault[];
  upload_guidance: {
    reason: string | null;
    recommended_photos: string[];
    photo_tips: string[];
  };
  analyzed_at: string;
};

export type PdfLibraryDocument = {
  id: string;
  title: string;
  description: string;
  category: string;
  filename: string;
  page_count: number | null;
  file_size_bytes: number;
  updated_at: string;
};

export type SafetyChecklistDocument = PdfLibraryDocument;
export type GuideDocument = PdfLibraryDocument;

export type TaskStatus = "upcoming" | "in_progress" | "completed";
export type TaskPriority = "high" | "medium" | "low";

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type CreateTaskInput = {
  title: string;
  description?: string;
  status: Exclude<TaskStatus, "completed">;
  priority: TaskPriority;
  due_date?: string | null;
};

export type UpdateTaskInput = Partial<
  Pick<Task, "title" | "description" | "status" | "priority" | "due_date">
>;

async function apiFetch(
  path: string,
  init: RequestInit,
  useMock: boolean,
): Promise<Response> {
  const normalizedPath = path.replace(/^\//, "");
  const url = useMock
    ? `/api/mock/${normalizedPath}`
    : `${backendUrl}/api/v1/${normalizedPath}`;
  const accessToken = useMock ? null : await getFreshAccessToken();
  if (!useMock && !accessToken) {
    throw new ApiError("Your session expired. Please sign in again.", 401);
  }
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(url, { ...init, headers });
  if (!useMock && response.status === 401) {
    await invalidateBrowserSession();
    throw new ApiError("Your session expired. Please sign in again.", 401);
  }
  if (!response.ok) {
    let message = "The request could not be completed.";
    try {
      const body = (await response.json()) as {
        detail?: string;
        message?: string;
      };
      message = body.detail ?? body.message ?? message;
    } catch {}
    throw new ApiError(message, response.status);
  }
  return response;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { useMock?: boolean } = {},
): Promise<T> {
  const useMock = options.useMock ?? useMockApi;
  const response = await apiFetch(path, init, useMock);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiBlobRequest(
  path: string,
  init: RequestInit = {},
  options: { useMock?: boolean } = {},
): Promise<Blob> {
  const useMock = options.useMock ?? useMockApi;
  const response = await apiFetch(path, init, useMock);
  return response.blob();
}

export const frontendApi = {
  dashboard: () => apiRequest<{ greeting: string }>("dashboard"),
  listTasks: () =>
    apiRequest<{ tasks: Task[] }>("tasks", {}, { useMock: useMockTaskApi }),
  createTask: (task: CreateTaskInput) =>
    apiRequest<Task>(
      "tasks",
      { method: "POST", body: JSON.stringify(task) },
      { useMock: useMockTaskApi },
    ),
  updateTask: (taskId: string, task: UpdateTaskInput) =>
    apiRequest<Task>(
      `tasks/${encodeURIComponent(taskId)}`,
      { method: "PATCH", body: JSON.stringify(task) },
      { useMock: useMockTaskApi },
    ),
  deleteTask: (taskId: string) =>
    apiRequest<void>(
      `tasks/${encodeURIComponent(taskId)}`,
      { method: "DELETE" },
      { useMock: useMockTaskApi },
    ),
  analyzePhoto: (image: File) => {
    const body = new FormData();
    body.append("image", image, image.name);
    return apiRequest<PhotoAnalysisResult>("photo-analysis", {
      method: "POST",
      body,
    }, { useMock: useMockPhotoApi });
  },
  generateChecklist: (task: string) =>
    apiRequest<{ id: string; title: string }>("checklists/generate", {
      method: "POST",
      body: JSON.stringify({ task }),
    }),
  listSafetyChecklists: () =>
    apiRequest<{ documents: SafetyChecklistDocument[] }>(
      "safety-checklists",
      {},
      { useMock: useMockChecklistApi },
    ),
  getSafetyChecklistFile: (checklistId: string, download = false) =>
    apiBlobRequest(
      `safety-checklists/${encodeURIComponent(checklistId)}/file?download=${download}`,
      { headers: { Accept: "application/pdf" } },
      { useMock: useMockChecklistApi },
    ),
  listGuides: () =>
    apiRequest<{ documents: GuideDocument[] }>(
      "guides",
      {},
      { useMock: useMockGuideApi },
    ),
  getGuideFile: (guideId: string, download = false) =>
    apiBlobRequest(
      `guides/${encodeURIComponent(guideId)}/file?download=${download}`,
      { headers: { Accept: "application/pdf" } },
      { useMock: useMockGuideApi },
    ),
  listConversations: () =>
    apiRequest<{ conversations: ConversationSummary[] }>(
      "conversations",
      {},
      { useMock: useMockChatApi },
    ),
  createConversation: (title?: string) =>
    apiRequest<ConversationSummary>("conversations", {
      method: "POST",
      body: JSON.stringify(title ? { title } : {}),
    }, { useMock: useMockChatApi }),
  getConversation: (conversationId: string) =>
    apiRequest<ConversationDetail>(
      `conversations/${conversationId}`,
      {},
      { useMock: useMockChatApi },
    ),
  renameConversation: (conversationId: string, title: string) =>
    apiRequest<ConversationSummary>(`conversations/${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }, { useMock: useMockChatApi }),
  deleteConversation: (conversationId: string) =>
    apiRequest<void>(
      `conversations/${conversationId}`,
      { method: "DELETE" },
      { useMock: useMockChatApi },
    ),
  sendConversationMessage: (conversationId: string, message: string) =>
    apiRequest<SendConversationMessageResponse>(
      `conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ message }),
      },
      { useMock: useMockChatApi },
    ),
};
