"""Public contracts for the one-time electrical learner profile."""

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

QuestionId = Literal[
    "electrical_experience",
    "training_background",
    "systems_familiarity",
    "safety_habits",
    "tools_familiarity",
    "troubleshooting_approach",
    "work_quality_habits",
    "documentation_habits",
    "confidence_support_needs",
    "learning_goals_preferences",
]
CompetencyId = Literal[
    "safety_procedures",
    "tool_usage",
    "technical_knowledge",
    "work_quality",
    "testing_verification",
    "documentation",
]
ChecklistCriterionId = Literal[
    "safety_supply_isolated",
    "safety_absence_verified",
    "safety_ppe_area",
    "tools_selected",
    "tools_used_correctly",
    "tools_condition_control",
    "technical_operation",
    "technical_components",
    "technical_sequence",
    "quality_terminations",
    "quality_routing",
    "quality_integrity",
    "testing_prechecks",
    "testing_instrument",
    "testing_results",
    "docs_labels",
    "docs_diagram",
    "docs_results",
]
AssessmentStatus = Literal["draft", "completed"]
VideoStatus = Literal["not_provided", "analyzed", "failed"]
AnswerSource = Literal["empty", "ai", "user", "ai_edited"]


class AssessmentQuestionDefinition(BaseModel):
    id: QuestionId
    prompt: str
    points: Literal[10] = 10
    competency: CompetencyId


class ChecklistCriterionDefinition(BaseModel):
    id: ChecklistCriterionId
    label: str


class ChecklistSectionDefinition(BaseModel):
    competency: CompetencyId
    label: str
    criteria: list[ChecklistCriterionDefinition]


FIXED_QUESTIONS: tuple[AssessmentQuestionDefinition, ...] = (
    AssessmentQuestionDefinition(
        id="electrical_experience",
        prompt=(
            "How would you describe your current electrical experience, "
            "including how long and in what settings you have learned or worked?"
        ),
        competency="technical_knowledge",
    ),
    AssessmentQuestionDefinition(
        id="training_background",
        prompt=(
            "What electrical education, training, certifications, "
            "apprenticeships, or informal learning have you completed?"
        ),
        competency="technical_knowledge",
    ),
    AssessmentQuestionDefinition(
        id="systems_familiarity",
        prompt=(
            "Which electrical systems, circuits, equipment, or types of tasks "
            "are you already familiar with?"
        ),
        competency="technical_knowledge",
    ),
    AssessmentQuestionDefinition(
        id="safety_habits",
        prompt=(
            "What safety steps and personal protective equipment do you "
            "normally use before and during electrical work?"
        ),
        competency="safety_procedures",
    ),
    AssessmentQuestionDefinition(
        id="tools_familiarity",
        prompt=(
            "Which hand tools and electrical test instruments can you use "
            "confidently, and which ones are less familiar?"
        ),
        competency="tool_usage",
    ),
    AssessmentQuestionDefinition(
        id="troubleshooting_approach",
        prompt=(
            "When an electrical circuit or device is not working, how do you "
            "usually troubleshoot it?"
        ),
        competency="testing_verification",
    ),
    AssessmentQuestionDefinition(
        id="work_quality_habits",
        prompt=(
            "What habits do you follow to keep wiring and connections neat, "
            "secure, protected, and reliable?"
        ),
        competency="work_quality",
    ),
    AssessmentQuestionDefinition(
        id="documentation_habits",
        prompt=(
            "How do you normally record diagrams, labels, measurements, faults, "
            "or completed work?"
        ),
        competency="documentation",
    ),
    AssessmentQuestionDefinition(
        id="confidence_support_needs",
        prompt=(
            "Which electrical topics are you most confident in, and where do "
            "you want more guidance?"
        ),
        competency="technical_knowledge",
    ),
    AssessmentQuestionDefinition(
        id="learning_goals_preferences",
        prompt=(
            "What are your electrical learning goals, and how do you prefer "
            "technical explanations or instructions to be presented?"
        ),
        competency="technical_knowledge",
    ),
)

FIXED_CHECKLIST: tuple[ChecklistSectionDefinition, ...] = (
    ChecklistSectionDefinition(
        competency="safety_procedures",
        label="Safety Procedures",
        criteria=[
            ChecklistCriterionDefinition(
                id="safety_supply_isolated",
                label="Describes isolating the supply before electrical work",
            ),
            ChecklistCriterionDefinition(
                id="safety_absence_verified",
                label="Describes verifying absence of voltage safely",
            ),
            ChecklistCriterionDefinition(
                id="safety_ppe_area",
                label="Identifies appropriate PPE and safe work-area habits",
            ),
        ],
    ),
    ChecklistSectionDefinition(
        competency="tool_usage",
        label="Tool Usage",
        criteria=[
            ChecklistCriterionDefinition(
                id="tools_selected",
                label="Reports familiarity with suitable, correctly rated tools",
            ),
            ChecklistCriterionDefinition(
                id="tools_used_correctly",
                label="Describes safe and appropriate tool or instrument use",
            ),
            ChecklistCriterionDefinition(
                id="tools_condition_control",
                label="Describes checking and caring for tools and test leads",
            ),
        ],
    ),
    ChecklistSectionDefinition(
        competency="technical_knowledge",
        label="Technical Knowledge",
        criteria=[
            ChecklistCriterionDefinition(
                id="technical_operation",
                label="Explains familiar electrical concepts at the reported level",
            ),
            ChecklistCriterionDefinition(
                id="technical_components",
                label="Identifies systems, components, or circuits already familiar",
            ),
            ChecklistCriterionDefinition(
                id="technical_sequence",
                label="Recognizes current knowledge limits and support needs",
            ),
        ],
    ),
    ChecklistSectionDefinition(
        competency="work_quality",
        label="Work Quality",
        criteria=[
            ChecklistCriterionDefinition(
                id="quality_terminations",
                label="Describes habits for secure and reliable terminations",
            ),
            ChecklistCriterionDefinition(
                id="quality_routing",
                label="Describes neat, supported, and protected cable routing",
            ),
            ChecklistCriterionDefinition(
                id="quality_integrity",
                label="Describes checking mechanical condition and integrity",
            ),
        ],
    ),
    ChecklistSectionDefinition(
        competency="testing_verification",
        label="Testing & Verification",
        criteria=[
            ChecklistCriterionDefinition(
                id="testing_prechecks",
                label="Describes a systematic and safe troubleshooting approach",
            ),
            ChecklistCriterionDefinition(
                id="testing_instrument",
                label="Reports selecting suitable test methods and instrument ranges",
            ),
            ChecklistCriterionDefinition(
                id="testing_results",
                label="Describes interpreting and verifying test results",
            ),
        ],
    ),
    ChecklistSectionDefinition(
        competency="documentation",
        label="Documentation",
        criteria=[
            ChecklistCriterionDefinition(
                id="docs_labels",
                label="Reports using clear circuit, conductor, or component labels",
            ),
            ChecklistCriterionDefinition(
                id="docs_diagram",
                label="Reports creating or updating diagrams and connection records",
            ),
            ChecklistCriterionDefinition(
                id="docs_results",
                label="Reports documenting readings, faults, and outcomes",
            ),
        ],
    ),
)

QUESTION_IDS = tuple(question.id for question in FIXED_QUESTIONS)
COMPETENCY_IDS = tuple(section.competency for section in FIXED_CHECKLIST)
CHECKLIST_IDS_BY_COMPETENCY = {
    section.competency: tuple(item.id for item in section.criteria)
    for section in FIXED_CHECKLIST
}
COMPETENCY_LABELS = {
    section.competency: section.label for section in FIXED_CHECKLIST
}
CHECKLIST_LABELS = {
    item.id: item.label
    for section in FIXED_CHECKLIST
    for item in section.criteria
}

MIN_VIDEO_SUGGESTION_CONFIDENCE = 50


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.split())
    return normalized or None


class VideoAnswerSuggestion(BaseModel):
    question_id: QuestionId
    answer: str | None = Field(default=None, max_length=4_000)
    confidence: int = Field(ge=0, le=100)
    evidence: str | None = Field(default=None, max_length=1_000)

    @field_validator("answer", "evidence")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def discard_unsupported_suggestion(self) -> Self:
        # A model-produced answer is only an autofill candidate when Gemini
        # supplies both a concrete evidence note and meaningful confidence.
        # Anything weaker remains empty for the learner to answer manually.
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
    question_id: QuestionId
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
    question_id: QuestionId
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
    question_id: QuestionId
    score: int = Field(ge=0, le=10)
    feedback: str = Field(min_length=1, max_length=1_500)
    evidence_basis: Literal["video", "answer", "both", "insufficient"]


class SkillScore(BaseModel):
    competency: CompetencyId
    label: str = Field(min_length=1, max_length=80)
    score: int = Field(ge=0, le=100)
    rationale: str = Field(min_length=1, max_length=1_500)
    confidence: int = Field(ge=0, le=100)


class ImprovementSuggestion(BaseModel):
    priority: Literal["high", "medium", "low"]
    competency: CompetencyId
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=1_500)
    action_steps: list[str] = Field(min_length=1, max_length=6)


class ChecklistCriterionResult(BaseModel):
    criterion_id: ChecklistCriterionId
    label: str = Field(min_length=1, max_length=180)
    status: Literal["met", "not_met", "not_observed"]
    rationale: str = Field(min_length=1, max_length=1_000)


class ChecklistSectionResult(BaseModel):
    competency: CompetencyId
    label: str = Field(min_length=1, max_length=80)
    score: int = Field(ge=0, le=100)
    status: Literal["mastered", "needs_improvement", "not_observed"]
    criteria: list[ChecklistCriterionResult] = Field(min_length=3, max_length=3)


class AssessmentEvaluation(BaseModel):
    summary: str = Field(min_length=1, max_length=2_000)
    question_feedback: list[QuestionFeedback] = Field(min_length=10, max_length=10)
    skill_scores: list[SkillScore] = Field(min_length=6, max_length=6)
    suggestions: list[ImprovementSuggestion] = Field(min_length=2, max_length=6)
    checklist_sections: list[ChecklistSectionResult] = Field(
        min_length=6,
        max_length=6,
    )

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
        _require_exact_ids(
            [item.competency for item in self.checklist_sections],
            COMPETENCY_IDS,
            "checklist sections",
        )
        for section in self.checklist_sections:
            _require_exact_ids(
                [item.criterion_id for item in section.criteria],
                CHECKLIST_IDS_BY_COMPETENCY[section.competency],
                f"{section.competency} checklist",
            )
        return self


class PracticalAssessment(BaseModel):
    id: UUID
    user_id: UUID
    questionnaire_version: str
    status: AssessmentStatus
    video_status: VideoStatus
    video_file_name: str | None
    video_mime_type: str | None
    video_size_bytes: int | None = Field(default=None, ge=0)
    video_sha256: str | None
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
    personalization_context: str | None = Field(default=None, max_length=4_000)
    revision: int = Field(ge=1)
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    @model_validator(mode="after")
    def require_valid_row_state(self) -> Self:
        _require_exact_ids(
            [answer.question_id for answer in self.answers],
            QUESTION_IDS,
            "stored answers",
        )
        if self.status == "completed":
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
                self.personalization_context,
                self.completed_at,
            )
            if any(value is None for value in required):
                raise ValueError("completed assessment data is incomplete")
        return self


class PracticalAssessmentResponse(BaseModel):
    assessment: PracticalAssessment | None
    questions: list[AssessmentQuestionDefinition]
    checklist_definitions: list[ChecklistSectionDefinition]


def assessment_response(
    assessment: PracticalAssessment | None,
) -> PracticalAssessmentResponse:
    return PracticalAssessmentResponse(
        assessment=assessment,
        questions=list(FIXED_QUESTIONS),
        checklist_definitions=list(FIXED_CHECKLIST),
    )


def _require_exact_ids(
    actual: list[str],
    expected: tuple[str, ...],
    label: str,
) -> None:
    if len(actual) != len(set(actual)) or set(actual) != set(expected):
        raise ValueError(f"{label} must contain every fixed ID exactly once")
