"""Public and Gemini wire contracts for practical work-video assessment."""

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

CompetencyId = Literal[
    "safety_procedures",
    "tool_usage",
    "technical_knowledge",
    "work_quality",
    "testing_verification",
    "documentation",
]
AssessmentStatus = Literal["draft", "completed"]
VideoStatus = Literal["questions_generated", "answers_generated"]
AnswerSource = Literal["empty", "ai", "user", "ai_edited"]

QUESTION_IDS = tuple(f"question_{number:02d}" for number in range(1, 11))
COMPETENCY_LABELS: dict[CompetencyId, str] = {
    "safety_procedures": "Safety Procedures",
    "tool_usage": "Tool Usage",
    "technical_knowledge": "Technical Knowledge",
    "work_quality": "Work Quality",
    "testing_verification": "Testing & Verification",
    "documentation": "Documentation",
}
COMPETENCY_IDS = tuple(COMPETENCY_LABELS)
MIN_VIDEO_SUGGESTION_CONFIDENCE = 50


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.split())
    return normalized or None


def _normalize_required_text(value: str) -> str:
    normalized = " ".join(value.split())
    if not normalized:
        raise ValueError("text cannot be blank")
    return normalized


class AssessmentQuestionDefinition(BaseModel):
    id: str = Field(pattern=r"^question_(0[1-9]|10)$")
    prompt: str = Field(min_length=1, max_length=1_000)
    points: Literal[10] = 10
    competency: CompetencyId

    @field_validator("prompt")
    @classmethod
    def normalize_prompt(cls, value: str) -> str:
        return _normalize_required_text(value)


# These deliberately small models are the only schemas sent to Gemini. Exact
# counts, identifiers, labels, and storage constraints are enforced after the
# response is parsed, keeping the provider-facing JSON schemas shallow.
class GeminiGeneratedQuestion(BaseModel):
    question_number: int
    prompt: str
    competency: CompetencyId


class GeminiQuestionGeneration(BaseModel):
    questions: list[GeminiGeneratedQuestion]


class GeminiVideoAnswer(BaseModel):
    question_number: int
    answer: str | None
    confidence: int
    evidence: str | None


class GeminiVideoAnswers(BaseModel):
    answers: list[GeminiVideoAnswer]


class GeminiQuestionFeedback(BaseModel):
    question_number: int
    score: int
    feedback: str
    evidence_basis: Literal["video", "answer", "both", "insufficient"]


class GeminiSkillScore(BaseModel):
    competency: CompetencyId
    score: int
    rationale: str
    confidence: int


class GeminiAssessmentResults(BaseModel):
    summary: str
    question_feedback: list[GeminiQuestionFeedback]
    skill_scores: list[GeminiSkillScore]


class GeminiImprovementSuggestion(BaseModel):
    priority: Literal["high", "medium", "low"]
    competency: CompetencyId
    title: str
    description: str
    action_steps: list[str]


class GeminiAssessmentSuggestions(BaseModel):
    suggestions: list[GeminiImprovementSuggestion]


class VideoAnswerSuggestion(BaseModel):
    question_id: str = Field(pattern=r"^question_(0[1-9]|10)$")
    answer: str | None = Field(default=None, max_length=4_000)
    confidence: int = Field(ge=0, le=100)
    evidence: str | None = Field(default=None, max_length=1_000)

    @field_validator("answer", "evidence")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def discard_unsupported_suggestion(self) -> Self:
        if (
            self.answer is None
            or self.evidence is None
            or self.confidence < MIN_VIDEO_SUGGESTION_CONFIDENCE
        ):
            self.answer = None
            self.confidence = 0
            self.evidence = None
        return self


class VideoInference(BaseModel):
    answers: list[VideoAnswerSuggestion] = Field(min_length=10, max_length=10)

    @model_validator(mode="after")
    def require_exact_questions(self) -> Self:
        _require_exact_ids(
            [answer.question_id for answer in self.answers],
            QUESTION_IDS,
            "video answers",
        )
        order = {question_id: index for index, question_id in enumerate(QUESTION_IDS)}
        self.answers.sort(key=lambda item: order[item.question_id])
        return self


class StoredVideoAnalysis(VideoInference):
    analyzed_at: datetime


class AssessmentAnswer(BaseModel):
    question_id: str = Field(pattern=r"^question_(0[1-9]|10)$")
    answer: str | None = Field(default=None, max_length=4_000)
    ai_answer: str | None = Field(default=None, max_length=4_000)
    answer_source: AnswerSource = "empty"
    ai_confidence: int | None = Field(default=None, ge=0, le=100)
    ai_evidence: str | None = Field(default=None, max_length=1_000)

    @field_validator("answer", "ai_answer", "ai_evidence")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class AssessmentAnswerInput(BaseModel):
    question_id: str = Field(pattern=r"^question_(0[1-9]|10)$")
    answer: str | None = Field(default=None, max_length=4_000)

    @field_validator("answer")
    @classmethod
    def normalize_answer(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class AssessmentAnswersUpdate(BaseModel):
    answers: list[AssessmentAnswerInput] = Field(min_length=10, max_length=10)

    @model_validator(mode="after")
    def require_exact_questions(self) -> Self:
        _require_exact_ids(
            [answer.question_id for answer in self.answers],
            QUESTION_IDS,
            "answers",
        )
        return self


class QuestionFeedback(BaseModel):
    question_id: str = Field(pattern=r"^question_(0[1-9]|10)$")
    score: int = Field(ge=0, le=10)
    feedback: str = Field(min_length=1, max_length=1_500)
    evidence_basis: Literal["video", "answer", "both", "insufficient"]

    @field_validator("feedback")
    @classmethod
    def normalize_feedback(cls, value: str) -> str:
        return _normalize_required_text(value)


class SkillScore(BaseModel):
    competency: CompetencyId
    label: str = Field(min_length=1, max_length=80)
    score: int = Field(ge=0, le=100)
    rationale: str = Field(min_length=1, max_length=1_500)
    confidence: int = Field(ge=0, le=100)

    @field_validator("label", "rationale")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return _normalize_required_text(value)


class ImprovementSuggestion(BaseModel):
    priority: Literal["high", "medium", "low"]
    competency: CompetencyId
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=1_500)
    action_steps: list[str] = Field(min_length=1, max_length=6)

    @field_validator("title", "description")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return _normalize_required_text(value)

    @field_validator("action_steps")
    @classmethod
    def normalize_steps(cls, values: list[str]) -> list[str]:
        normalized = [" ".join(value.split()) for value in values]
        if any(not value for value in normalized):
            raise ValueError("suggestion action steps cannot be blank")
        return normalized


class AssessmentEvaluation(BaseModel):
    summary: str = Field(min_length=1, max_length=2_000)
    question_feedback: list[QuestionFeedback] = Field(min_length=10, max_length=10)
    skill_scores: list[SkillScore] = Field(min_length=6, max_length=6)
    suggestions: list[ImprovementSuggestion] = Field(min_length=2, max_length=6)

    @field_validator("summary")
    @classmethod
    def normalize_summary(cls, value: str) -> str:
        return _normalize_required_text(value)

    @model_validator(mode="after")
    def require_fixed_result_sets(self) -> Self:
        _require_exact_ids(
            [item.question_id for item in self.question_feedback],
            QUESTION_IDS,
            "question feedback",
        )
        _require_exact_ids(
            [item.competency for item in self.skill_scores],
            COMPETENCY_IDS,
            "skill scores",
        )
        question_order = {
            question_id: index for index, question_id in enumerate(QUESTION_IDS)
        }
        competency_order = {
            competency: index for index, competency in enumerate(COMPETENCY_IDS)
        }
        self.question_feedback.sort(
            key=lambda item: question_order[item.question_id]
        )
        self.skill_scores.sort(
            key=lambda item: competency_order[item.competency]
        )
        for item in self.skill_scores:
            item.label = COMPETENCY_LABELS[item.competency]
        return self


class PracticalAssessment(BaseModel):
    id: UUID
    user_id: UUID
    questionnaire_version: str
    status: AssessmentStatus
    video_status: VideoStatus
    # Required internally for resumable private Storage access. Never serialize
    # the bucket object key into a browser-facing API response.
    video_object_path: str = Field(min_length=1, max_length=1_024, exclude=True)
    video_file_name: str = Field(min_length=1, max_length=255)
    video_mime_type: Literal["video/mp4", "video/mov", "video/webm"]
    video_size_bytes: int = Field(gt=0, le=100_000_000)
    video_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    questions: list[AssessmentQuestionDefinition] = Field(
        min_length=10,
        max_length=10,
    )
    video_analysis: StoredVideoAnalysis | None
    answers: list[AssessmentAnswer] = Field(min_length=10, max_length=10)
    safety_procedures_score: int | None = Field(default=None, ge=0, le=100)
    tool_usage_score: int | None = Field(default=None, ge=0, le=100)
    technical_knowledge_score: int | None = Field(default=None, ge=0, le=100)
    work_quality_score: int | None = Field(default=None, ge=0, le=100)
    testing_verification_score: int | None = Field(default=None, ge=0, le=100)
    documentation_score: int | None = Field(default=None, ge=0, le=100)
    overall_score: int | None = Field(default=None, ge=0, le=100)
    grade: Literal["A", "B", "C", "D", "F"] | None = None
    passed: bool | None = None
    evaluation: AssessmentEvaluation | None
    revision: int = Field(ge=1)
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    @field_validator("video_object_path")
    @classmethod
    def validate_video_object_path(cls, value: str) -> str:
        parts = value.split("/")
        if (
            value.startswith("/")
            or value.endswith("/")
            or any(part in {"", ".", ".."} for part in parts)
        ):
            raise ValueError("invalid private video object path")
        return value

    @field_validator("video_file_name")
    @classmethod
    def normalize_video_file_name(cls, value: str) -> str:
        return _normalize_required_text(value)

    @model_validator(mode="after")
    def require_valid_row_state(self) -> Self:
        _validate_question_set(self.questions)
        _require_exact_ids(
            [answer.question_id for answer in self.answers],
            QUESTION_IDS,
            "stored answers",
        )
        if self.video_status == "answers_generated" and self.video_analysis is None:
            raise ValueError("generated video answers are missing")
        if (
            self.video_status == "questions_generated"
            and self.video_analysis is not None
        ):
            raise ValueError("video analysis exists before answers were generated")
        if self.status == "draft" and self.completed_at is not None:
            raise ValueError("a draft assessment cannot have a completion time")
        if self.status == "completed":
            if self.video_status != "answers_generated":
                raise ValueError("completed assessment has no generated answers")
            if any(answer.answer is None for answer in self.answers):
                raise ValueError("completed assessment answers are incomplete")
            required = (
                self.safety_procedures_score,
                self.tool_usage_score,
                self.technical_knowledge_score,
                self.work_quality_score,
                self.testing_verification_score,
                self.documentation_score,
                self.overall_score,
                self.grade,
                self.passed,
                self.evaluation,
                self.completed_at,
            )
            if any(value is None for value in required):
                raise ValueError("completed assessment data is incomplete")
        return self


class PracticalAssessmentResponse(BaseModel):
    assessment: PracticalAssessment | None
    questions: list[AssessmentQuestionDefinition]


class PracticalAssessmentHistoryItem(BaseModel):
    """Compact completed-assessment data for dashboards and history lists."""

    id: UUID
    video_file_name: str = Field(min_length=1, max_length=255)
    overall_score: int = Field(ge=0, le=100)
    grade: Literal["A", "B", "C", "D", "F"]
    passed: bool
    safety_procedures_score: int = Field(ge=0, le=100)
    tool_usage_score: int = Field(ge=0, le=100)
    technical_knowledge_score: int = Field(ge=0, le=100)
    work_quality_score: int = Field(ge=0, le=100)
    testing_verification_score: int = Field(ge=0, le=100)
    documentation_score: int = Field(ge=0, le=100)
    created_at: datetime
    completed_at: datetime

    @field_validator("video_file_name")
    @classmethod
    def normalize_history_video_file_name(cls, value: str) -> str:
        return _normalize_required_text(value)


class PracticalAssessmentHistoryResponse(BaseModel):
    assessments: list[PracticalAssessmentHistoryItem]
    total: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)
    has_more: bool


def assessment_response(
    assessment: PracticalAssessment | None,
) -> PracticalAssessmentResponse:
    return PracticalAssessmentResponse(
        assessment=assessment,
        questions=list(assessment.questions) if assessment else [],
    )


def _validate_question_set(
    questions: list[AssessmentQuestionDefinition],
) -> None:
    _require_exact_ids(
        [question.id for question in questions],
        QUESTION_IDS,
        "assessment questions",
    )
    competencies = {question.competency for question in questions}
    missing = set(COMPETENCY_IDS) - competencies
    if missing:
        raise ValueError("assessment questions must cover all six competencies")
    prompts = [question.prompt.casefold() for question in questions]
    if len(prompts) != len(set(prompts)):
        raise ValueError("assessment question prompts must be unique")


def _require_exact_ids(
    actual: list[str],
    expected: tuple[str, ...],
    label: str,
) -> None:
    if len(actual) != len(set(actual)) or set(actual) != set(expected):
        raise ValueError(f"{label} must contain every fixed ID exactly once")
