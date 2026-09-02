"use client";

import { useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  frontendApi,
  type PracticalAssessment,
  type PracticalAssessmentQuestion,
  type PracticalAssessmentResponse,
  type SavePracticalAssessmentAnswersInput,
  type StartPracticalAssessmentInput,
} from "@/lib/api/client";

type AssessmentContextValue = {
  assessment: PracticalAssessment | null;
  questions: PracticalAssessmentQuestion[];
  historyAssessmentId: string | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<PracticalAssessmentResponse>;
  startAssessment: (
    input: StartPracticalAssessmentInput,
  ) => Promise<PracticalAssessmentResponse>;
  generateAnswers: (
    assessmentId: string,
  ) => Promise<PracticalAssessmentResponse>;
  updateLocalAnswer: (questionId: string, answer: string) => void;
  saveAnswers: (
    assessmentId: string,
    answers: SavePracticalAssessmentAnswersInput[],
  ) => Promise<PracticalAssessmentResponse>;
  evaluateAssessment: (
    assessmentId: string,
  ) => Promise<PracticalAssessmentResponse>;
};

const AssessmentContext = createContext<AssessmentContextValue | undefined>(
  undefined,
);

function requestErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Your practical assessment could not be loaded.";
}

export function PracticalAssessmentProvider({
  children,
}: {
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const historyAssessmentId = searchParams.get("assessmentId")?.trim() || null;
  const [payload, setPayload] = useState<PracticalAssessmentResponse>({
    assessment: null,
    questions: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const applyPayload = useCallback((nextPayload: PracticalAssessmentResponse) => {
    setPayload({
      assessment: nextPayload.assessment,
      questions: nextPayload.questions,
    });
    setError("");
  }, []);

  const refresh = useCallback(async () => {
    const activeRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const response = historyAssessmentId
        ? await frontendApi.getPracticalAssessment(historyAssessmentId)
        : await frontendApi.getMyPracticalAssessment();
      if (activeRequest === requestId.current) applyPayload(response);
      return response;
    } catch (caught) {
      if (activeRequest === requestId.current) {
        setError(requestErrorMessage(caught));
      }
      throw caught;
    } finally {
      if (activeRequest === requestId.current) setLoading(false);
    }
  }, [applyPayload, historyAssessmentId]);

  useEffect(() => {
    void refresh().catch(() => {});
    return () => {
      requestId.current += 1;
    };
  }, [refresh]);

  const startAssessment = useCallback(
    async (input: StartPracticalAssessmentInput) => {
      const response = await frontendApi.startPracticalAssessment(input);
      applyPayload(response);
      return response;
    },
    [applyPayload],
  );

  const updateLocalAnswer = useCallback(
    (questionId: string, answer: string) => {
      setPayload((current) => {
        if (!current.assessment) return current;
        const existing = current.assessment.answers.find(
          (item) => item.question_id === questionId,
        );
        const aiAnswer = existing?.ai_answer ?? null;
        const answerSource = !answer.trim()
          ? "empty"
          : aiAnswer
            ? answer === aiAnswer
              ? "ai"
              : "ai_edited"
            : "user";
        const updatedAnswer = {
          question_id: questionId,
          answer,
          ai_answer: aiAnswer,
          answer_source: answerSource,
          ai_confidence: existing?.ai_confidence ?? null,
          ai_evidence: existing?.ai_evidence ?? null,
        } as const;
        const answerExists = Boolean(existing);
        return {
          ...current,
          assessment: {
            ...current.assessment,
            answers: answerExists
              ? current.assessment.answers.map((item) =>
                  item.question_id === questionId ? updatedAnswer : item,
                )
              : [...current.assessment.answers, updatedAnswer],
          },
        };
      });
    },
    [],
  );

  const generateAnswers = useCallback(
    async (assessmentId: string) => {
      const response = await frontendApi.generatePracticalAssessmentAnswers(
        assessmentId,
      );
      applyPayload(response);
      return response;
    },
    [applyPayload],
  );

  const saveAnswers = useCallback(
    async (
      assessmentId: string,
      answers: SavePracticalAssessmentAnswersInput[],
    ) => {
      const response = await frontendApi.savePracticalAssessmentAnswers(
        assessmentId,
        answers,
      );
      applyPayload(response);
      return response;
    },
    [applyPayload],
  );

  const evaluateAssessment = useCallback(
    async (assessmentId: string) => {
      const response = await frontendApi.evaluatePracticalAssessment(
        assessmentId,
      );
      applyPayload(response);
      return response;
    },
    [applyPayload],
  );

  const value = useMemo<AssessmentContextValue>(
    () => ({
      assessment: payload.assessment,
      questions: payload.questions,
      historyAssessmentId,
      loading,
      error,
      refresh,
      startAssessment,
      generateAnswers,
      updateLocalAnswer,
      saveAnswers,
      evaluateAssessment,
    }),
    [
      payload,
      historyAssessmentId,
      loading,
      error,
      refresh,
      startAssessment,
      generateAnswers,
      updateLocalAnswer,
      saveAnswers,
      evaluateAssessment,
    ],
  );

  return (
    <AssessmentContext.Provider value={value}>
      {children}
    </AssessmentContext.Provider>
  );
}

export function usePracticalAssessment() {
  const context = useContext(AssessmentContext);
  if (!context) {
    throw new Error(
      "usePracticalAssessment must be used inside PracticalAssessmentProvider",
    );
  }
  return context;
}
