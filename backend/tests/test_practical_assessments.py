import asyncio
import hashlib
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.language import reset_response_language, set_response_language
from app.db.base import Base
from app.db.models import PracticalAssessmentRecord, User
from app.main import app
from app.schemas.practical_assessments import (
    COMPETENCY_IDS,
    COMPETENCY_LABELS,
    QUESTION_IDS,
    AssessmentAnswer,
    AssessmentAnswersUpdate,
    AssessmentEvaluation,
    AssessmentQuestionDefinition,
    GeminiAssessmentResults,
    GeminiAssessmentSuggestions,
    GeminiGeneratedQuestion,
    GeminiImprovementSuggestion,
    GeminiQuestionFeedback,
    GeminiQuestionGeneration,
    GeminiSkillScore,
    ImprovementSuggestion,
    PracticalAssessment,
    PracticalAssessmentHistoryItem,
    QuestionFeedback,
    SkillScore,
    StoredVideoAnalysis,
    VideoAnswerSuggestion,
    VideoInference,
)
from app.services.practical_assessments import (
    AssessmentVideoTooLargeError,
    GeminiPracticalAssessmentAnalyzer,
    PracticalAssessmentCompletedError,
    PracticalAssessmentConflictError,
    PracticalAssessmentIncompleteError,
    PracticalAssessmentProviderError,
    PracticalAssessmentService,
    SQLitePracticalAssessmentRepository,
    UnsupportedAssessmentVideoError,
    ValidatedAssessmentVideo,
    get_practical_assessment_service,
    stream_and_validate_video,
)

USER_ID = UUID("d2f7c64a-3e56-4d45-a47d-07331e2a95df")
ASSESSMENT_ID = UUID("11111111-2222-4333-8444-555555555555")
NOW = datetime(2026, 8, 25, 10, 0, tzinfo=UTC)


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def enable_fk(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    with Session(engine) as session:
        now = datetime.now(UTC).replace(tzinfo=None)
        session.add(
            User(
                id=str(USER_ID),
                email="learner@example.com",
                password_hash="placeholder",
                is_active=True,
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()
        yield session


def _user():
    from app.core.security import AuthenticatedUser

    return AuthenticatedUser(
        id=USER_ID,
        access_token="user-jwt",
        role="authenticated",
        email="learner@example.com",
        claims={},
    )


def _questions() -> list[AssessmentQuestionDefinition]:
    competencies = (
        "safety_procedures",
        "tool_usage",
        "technical_knowledge",
        "work_quality",
        "testing_verification",
        "documentation",
        "safety_procedures",
        "tool_usage",
        "testing_verification",
        "documentation",
    )
    return [
        AssessmentQuestionDefinition(
            id=question_id,
            prompt=f"Video-specific work assessment question {number}?",
            competency=competencies[number - 1],
        )
        for number, question_id in enumerate(QUESTION_IDS, start=1)
    ]


def _answers(value: str | None = None) -> list[AssessmentAnswer]:
    return [
        AssessmentAnswer(
            question_id=question_id,
            answer=value,
            answer_source="user" if value else "empty",
        )
        for question_id in QUESTION_IDS
    ]


def _video_inference(
    *,
    first_answer: str | None = "Observed safe isolation",
) -> VideoInference:
    return VideoInference(
        answers=[
            VideoAnswerSuggestion(
                question_id=question_id,
                answer=first_answer if index == 0 else None,
                confidence=82 if index == 0 and first_answer else 0,
                evidence=(
                    "At 00:08 the worker isolates the supply."
                    if index == 0 and first_answer
                    else None
                ),
            )
            for index, question_id in enumerate(QUESTION_IDS)
        ]
    )


def _evaluation(
    scores: dict[str, int] | None = None,
) -> AssessmentEvaluation:
    score_values = scores or {competency: 80 for competency in COMPETENCY_IDS}
    return AssessmentEvaluation(
        summary="The submitted work shows a sound developing practical method.",
        question_feedback=[
            QuestionFeedback(
                question_id=question_id,
                score=8,
                feedback="The answer and video provide relevant work evidence.",
                evidence_basis="both",
            )
            for question_id in reversed(QUESTION_IDS)
        ],
        skill_scores=[
            SkillScore(
                competency=competency,
                label="Model supplied label",
                score=score_values[competency],
                rationale="The submitted evidence supports this practical score.",
                confidence=70,
            )
            for competency in reversed(COMPETENCY_IDS)
        ],
        suggestions=[
            ImprovementSuggestion(
                priority="medium",
                competency="testing_verification",
                title="Improve verification",
                description="Repeat the safe verification sequence.",
                action_steps=["Review the procedure", "Practise de-energized"],
            ),
            ImprovementSuggestion(
                priority="low",
                competency="documentation",
                title="Record readings",
                description="Keep a concise test record.",
                action_steps=["Use a test record template"],
            ),
        ],
    )


def _row(**overrides: Any) -> PracticalAssessment:
    values: dict[str, Any] = {
        "id": ASSESSMENT_ID,
        "user_id": USER_ID,
        "questionnaire_version": "work_video_v3",
        "status": "draft",
        "video_status": "questions_generated",
        "video_object_path": f"{USER_ID}/{ASSESSMENT_ID}/work-video.mp4",
        "video_file_name": "work-video.mp4",
        "video_mime_type": "video/mp4",
        "video_size_bytes": 100,
        "video_sha256": "a" * 64,
        "questions": _questions(),
        "video_analysis": None,
        "answers": _answers(),
        "safety_procedures_score": None,
        "tool_usage_score": None,
        "technical_knowledge_score": None,
        "work_quality_score": None,
        "testing_verification_score": None,
        "documentation_score": None,
        "overall_score": None,
        "grade": None,
        "passed": None,
        "evaluation": None,
        "revision": 1,
        "created_at": NOW,
        "updated_at": NOW,
        "completed_at": None,
    }
    values.update(overrides)
    if "video_object_path" not in overrides:
        values["video_object_path"] = (
            f"{values['user_id']}/{values['id']}/work-video.mp4"
        )
    return PracticalAssessment.model_validate(values)


def _row_json(**overrides: Any) -> dict[str, Any]:
    row = _row(**overrides)
    payload = row.model_dump(mode="json")
    # The private object key is intentionally excluded from browser-facing
    # serialization, but repository fixtures need it for private-file lookup.
    payload["video_object_path"] = row.video_object_path
    return payload


def _completed_overrides() -> dict[str, Any]:
    inference = _video_inference()
    return {
        "status": "completed",
        "video_status": "answers_generated",
        "video_analysis": StoredVideoAnalysis(
            **inference.model_dump(),
            analyzed_at=NOW,
        ),
        "answers": _answers("Complete answer"),
        "safety_procedures_score": 80,
        "tool_usage_score": 80,
        "technical_knowledge_score": 80,
        "work_quality_score": 80,
        "testing_verification_score": 80,
        "documentation_score": 80,
        "overall_score": 80,
        "grade": "B",
        "passed": True,
        "evaluation": _evaluation(),
        "completed_at": NOW,
    }


def _completed_row(**overrides: Any) -> PracticalAssessment:
    values = _completed_overrides()
    values.update(overrides)
    return _row(**values)


class FakeUpload:
    def __init__(self, data: bytes, content_type: str, filename: str) -> None:
        self._data = data
        self._position = 0
        self.content_type = content_type
        self.filename = filename

    async def read(self, size: int = -1) -> bytes:
        if self._position >= len(self._data):
            return b""
        end = len(self._data) if size < 0 else self._position + size
        chunk = self._data[self._position : end]
        self._position = end
        return chunk


def test_dynamic_question_contract_has_stable_ids_and_all_competencies() -> None:
    questions = _questions()

    assert QUESTION_IDS == tuple(
        f"question_{number:02d}" for number in range(1, 11)
    )
    assert len({question.prompt for question in questions}) == 10
    assert {question.competency for question in questions} == set(COMPETENCY_IDS)
    assert len(COMPETENCY_LABELS) == 6
    assert "checklist_sections" not in AssessmentEvaluation.model_fields


@pytest.mark.parametrize(
    ("confidence", "evidence"),
    [(0, None), (49, "At 00:08 the work is visible."), (80, None)],
)
def test_weak_video_suggestions_are_left_empty(
    confidence: int,
    evidence: str | None,
) -> None:
    suggestion = VideoAnswerSuggestion(
        question_id=QUESTION_IDS[0],
        answer="The worker isolates and verifies the circuit.",
        confidence=confidence,
        evidence=evidence,
    )

    assert suggestion.answer is None
    assert suggestion.confidence == 0
    assert suggestion.evidence is None


def test_supported_video_suggestion_is_retained() -> None:
    suggestion = VideoAnswerSuggestion(
        question_id=QUESTION_IDS[0],
        answer="The worker isolates and verifies the circuit.",
        confidence=50,
        evidence="At 00:08 the work is visible.",
    )

    assert suggestion.answer is not None
    assert suggestion.confidence == 50
    assert suggestion.evidence is not None


def test_video_is_streamed_validated_hashed_and_removed() -> None:
    data = b"\x00\x00\x00\x18ftypmp42" + b"video-data"
    upload = FakeUpload(data, "video/mp4", "../practice.mp4")

    video = asyncio.run(stream_and_validate_video(upload, max_bytes=1_000))

    assert video.file_name == "practice.mp4"
    assert video.mime_type == "video/mp4"
    assert video.size_bytes == len(data)
    assert len(video.sha256) == 64
    assert video.path.exists()
    video.cleanup()
    assert not video.path.exists()


def test_video_with_blank_browser_mime_uses_safe_extension_then_magic() -> None:
    data = b"\x00\x00\x00\x18ftypmp42" + b"video-data"
    video = asyncio.run(
        stream_and_validate_video(
            FakeUpload(data, "", "practice.MP4"),
            max_bytes=1_000,
        )
    )
    try:
        assert video.mime_type == "video/mp4"
    finally:
        video.cleanup()

    with pytest.raises(UnsupportedAssessmentVideoError):
        asyncio.run(
            stream_and_validate_video(
                FakeUpload(data, "application/octet-stream", "practice.bin"),
                max_bytes=1_000,
            )
        )


def test_video_rejects_oversized_and_mismatched_uploads() -> None:
    data = b"\x00\x00\x00\x18ftypmp42" + b"video-data"
    with pytest.raises(AssessmentVideoTooLargeError):
        asyncio.run(
            stream_and_validate_video(
                FakeUpload(data, "video/mp4", "practice.mp4"),
                max_bytes=5,
            )
        )
    with pytest.raises(UnsupportedAssessmentVideoError):
        asyncio.run(
            stream_and_validate_video(
                FakeUpload(data, "video/webm", "practice.webm"),
                max_bytes=1_000,
            )
        )


def test_question_generation_uploads_video_and_deletes_remote_file(
    tmp_path: Path,
) -> None:
    analyzer = object.__new__(GeminiPracticalAssessmentAnalyzer)
    analyzer._api_key = "test-key"
    analyzer._model = "test-model"
    analyzer._fallback_models = ""
    analyzer._max_output_tokens = 1_000
    analyzer._max_retries = 1
    analyzer._file_timeout = 1
    analyzer._client = SimpleNamespace()
    remote_file = SimpleNamespace(name="files/work-video")
    uploaded: list[Path] = []
    deleted: list[str] = []

    async def upload_video(_: object, video: ValidatedAssessmentVideo) -> object:
        uploaded.append(video.path)
        return remote_file

    async def delete_video(_: object, remote: object) -> None:
        deleted.append(remote.name)

    async def generate(_: object, contents: object, __: object) -> object:
        assert contents[0] is remote_file
        return SimpleNamespace(
            parsed=GeminiQuestionGeneration(
                questions=[
                    GeminiGeneratedQuestion(
                        question_number=number,
                        prompt=question.prompt,
                        competency=question.competency,
                    )
                    for number, question in enumerate(_questions(), start=1)
                ]
            )
        )

    analyzer._upload_video = upload_video
    analyzer._delete_remote_file = delete_video
    analyzer._generate_with_retry = generate
    video = _validated_video(tmp_path)
    try:
        questions = asyncio.run(analyzer.generate_questions(video))
    finally:
        video.cleanup()

    assert len(questions) == 10
    assert uploaded
    assert deleted == ["files/work-video"]


def test_practical_assessment_schema_contains_sqlite_integrity_guards(
    db_session: Session,
) -> None:
    inspector = inspect(db_session.get_bind())
    constraints = {
        item["name"]
        for item in inspector.get_check_constraints("practical_assessments")
    }

    assert {
        "practical_assessments_questionnaire_version_check",
        "practical_assessments_video_file_name_check",
        "practical_assessments_video_mime_type_check",
        "practical_assessments_video_size_bytes_check",
        "practical_assessments_video_sha256_check",
        "practical_assessments_video_object_path_check",
        "practical_assessments_questions_check",
        "practical_assessments_answers_check",
        "practical_assessments_video_analysis_check",
        "practical_assessments_video_state_check",
        "practical_assessments_overall_score_check",
        "practical_assessments_evaluation_check",
        "practical_assessments_completion_check",
    } <= constraints


@pytest.mark.parametrize(
    "changes",
    [
        {"questionnaire_version": "legacy"},
        {"video_file_name": "   "},
        {"video_mime_type": "text/plain"},
        {"video_size_bytes": 0},
        {"video_sha256": "not-a-sha256"},
        {"video_object_path": "../outside.mp4"},
        {"questions": "not-json"},
        {"answers": "[]"},
        {"video_status": "answers_generated", "video_analysis": None},
        {"overall_score": 101},
        {"evaluation": "not-json"},
    ],
)
def test_database_rejects_invalid_practical_assessment_values(
    changes: dict[str, object],
    tmp_path: Path,
    db_session: Session,
) -> None:
    repository = SQLitePracticalAssessmentRepository(
        session=db_session,
        video_directory=tmp_path / "videos",
    )
    row = _row()
    repository.create_draft(
        assessment_id=row.id,
        user_id=row.user_id,
        payload=_row_json(),
    )

    with pytest.raises(IntegrityError):
        db_session.execute(
            update(PracticalAssessmentRecord)
            .where(PracticalAssessmentRecord.id == str(row.id))
            .values(**changes)
        )
        db_session.commit()
    db_session.rollback()


def test_completed_practical_assessment_is_immutable_in_database(
    tmp_path: Path,
    db_session: Session,
) -> None:
    repository = SQLitePracticalAssessmentRepository(
        session=db_session,
        video_directory=tmp_path / "videos",
    )
    row = _row()
    draft = repository.create_draft(
        assessment_id=row.id,
        user_id=row.user_id,
        payload=_row_json(),
    )
    repository.complete(assessment=draft, updates=_completed_overrides())

    with pytest.raises(IntegrityError, match="completed practical assessment"):
        db_session.execute(
            update(PracticalAssessmentRecord)
            .where(PracticalAssessmentRecord.id == str(row.id))
            .values(overall_score=99)
        )
        db_session.commit()
    db_session.rollback()


def test_local_video_storage_rejects_paths_outside_configured_root(
    tmp_path: Path,
    db_session: Session,
) -> None:
    source = _validated_video(tmp_path)
    repository = SQLitePracticalAssessmentRepository(
        session=db_session,
        video_directory=tmp_path / "videos",
    )
    try:
        with pytest.raises(PracticalAssessmentProviderError, match="path is invalid"):
            repository.upload_video(object_path="../outside.mp4", video=source)
    finally:
        source.cleanup()

    assert not (tmp_path / "outside.mp4").exists()


def test_repository_reads_and_writes_with_sqlite(
    tmp_path: Path, db_session: Session
) -> None:
    repository = SQLitePracticalAssessmentRepository(
        session=db_session,
        video_directory=tmp_path / "videos",
    )
    row = _row()
    created = repository.create_draft(
        assessment_id=row.id,
        user_id=row.user_id,
        payload=_row_json(),
    )
    assert created.revision == 1

    current = repository.get_for_user(user_id=USER_ID)
    assert current is not None
    updated = repository.update_draft(
        assessment=current,
        updates={"video_status": "questions_generated"},
    )
    assert updated.revision == 2


def test_repository_prefers_draft_then_falls_back_to_latest_completion(
    tmp_path: Path, db_session: Session
) -> None:
    repository = SQLitePracticalAssessmentRepository(
        session=db_session,
        video_directory=tmp_path / "videos",
    )
    completed_id = uuid4()
    draft1 = repository.create_draft(
        assessment_id=completed_id,
        user_id=USER_ID,
        payload=_row_json(id=completed_id),
    )
    repository.complete(
        assessment=draft1,
        updates=_completed_overrides(),
    )

    assessment = repository.get_for_user(user_id=USER_ID)
    assert assessment is not None
    assert assessment.status == "completed"

    draft2_id = uuid4()
    repository.create_draft(
        assessment_id=draft2_id,
        user_id=USER_ID,
        payload=_row_json(id=draft2_id),
    )
    current = repository.get_for_user(user_id=USER_ID)
    assert current is not None
    assert current.status == "draft"
    assert current.id == draft2_id


def test_repository_lists_completed_history_with_exact_total(
    tmp_path: Path, db_session: Session
) -> None:
    repository = SQLitePracticalAssessmentRepository(
        session=db_session,
        video_directory=tmp_path / "videos",
    )
    for _ in range(4):
        cid = uuid4()
        draft = repository.create_draft(
            assessment_id=cid,
            user_id=USER_ID,
            payload=_row_json(id=cid),
        )
        repository.complete(
            assessment=draft,
            updates=_completed_overrides(),
        )

    assessments, total = repository.list_completed_for_user(
        user_id=USER_ID,
        limit=3,
        offset=0,
    )
    assert len(assessments) == 3
    assert total == 4


def test_repository_enforces_one_draft_per_user(
    tmp_path: Path, db_session: Session
) -> None:
    repository = SQLitePracticalAssessmentRepository(
        session=db_session,
        video_directory=tmp_path / "videos",
    )
    row = _row()
    repository.create_draft(
        assessment_id=row.id,
        user_id=row.user_id,
        payload=_row_json(),
    )
    with pytest.raises(PracticalAssessmentConflictError):
        repository.create_draft(
            assessment_id=uuid4(),
            user_id=row.user_id,
            payload=_row_json(id=uuid4()),
        )


def test_repository_stores_and_retrieves_video_locally(
    tmp_path: Path, db_session: Session
) -> None:
    source = _validated_video(tmp_path)
    repository = SQLitePracticalAssessmentRepository(
        session=db_session,
        video_directory=tmp_path / "videos",
    )
    row = _row(
        video_size_bytes=source.size_bytes,
        video_sha256=source.sha256,
    )
    repository.upload_video(
        object_path=row.video_object_path,
        video=source,
    )
    stored_path = tmp_path / "videos" / row.video_object_path
    assert stored_path.is_file()

    downloaded = repository.download_video(
        assessment=row,
        max_bytes=10_000,
    )
    try:
        assert downloaded.path.read_bytes() == source.path.read_bytes()
    finally:
        downloaded.cleanup()
        source.cleanup()

    repository.delete_video(object_path=row.video_object_path)
    assert not stored_path.exists()


class FakeAnalyzer:
    def __init__(
        self,
        *,
        fail_questions: bool = False,
        evaluation: AssessmentEvaluation | None = None,
    ) -> None:
        self.fail_questions = fail_questions
        self.final_evaluation = evaluation or _evaluation()
        self.question_calls = 0
        self.answer_calls = 0
        self.evaluation_calls = 0
        self.received_questions: list[AssessmentQuestionDefinition] | None = None

    async def generate_questions(
        self,
        _: ValidatedAssessmentVideo,
    ) -> list[AssessmentQuestionDefinition]:
        self.question_calls += 1
        if self.fail_questions:
            raise PracticalAssessmentProviderError("provider unavailable")
        return _questions()

    async def generate_answers(
        self,
        _: ValidatedAssessmentVideo,
        questions: list[AssessmentQuestionDefinition],
    ) -> VideoInference:
        self.answer_calls += 1
        self.received_questions = questions
        return _video_inference()

    async def evaluate(
        self,
        _: ValidatedAssessmentVideo,
        assessment: PracticalAssessment,
    ) -> AssessmentEvaluation:
        self.evaluation_calls += 1
        self.received_questions = assessment.questions
        return self.final_evaluation


class FakeRepository:
    def __init__(
        self,
        current: PracticalAssessment | None = None,
        *,
        downloaded_video: ValidatedAssessmentVideo | None = None,
    ) -> None:
        self.current = current
        self.downloaded_video = downloaded_video
        self.create_payload: dict[str, Any] | None = None
        self.created_assessment_ids: list[UUID] = []
        self.update_payloads: list[dict[str, Any]] = []
        self.uploaded_paths: list[str] = []
        self.deleted_paths: list[str] = []

    def get_for_user(self, **_: object) -> PracticalAssessment | None:
        return self.current

    def get_draft_for_user(self, **_: object) -> PracticalAssessment | None:
        if self.current is None or self.current.status == "completed":
            return None
        return self.current

    def list_completed_for_user(
        self,
        **_: object,
    ) -> tuple[list[PracticalAssessmentHistoryItem], int]:
        if self.current is None or self.current.status != "completed":
            return [], 0
        item = PracticalAssessmentHistoryItem.model_validate(
            self.current.model_dump(mode="json")
        )
        return [item], 1

    def get_by_id(self, **_: object) -> PracticalAssessment:
        if self.current is None:
            raise AssertionError("missing fake assessment")
        return self.current

    def create_draft(
        self,
        *,
        assessment_id: UUID,
        user_id: UUID,
        payload: dict[str, Any],
    ) -> PracticalAssessment:
        self.create_payload = payload
        self.created_assessment_ids.append(assessment_id)
        self.current = _row(id=assessment_id, user_id=user_id, **payload)
        return self.current

    def update_draft(
        self,
        *,
        updates: dict[str, Any],
        **_: object,
    ) -> PracticalAssessment:
        assert self.current is not None
        self.update_payloads.append(updates)
        candidate = self.current.model_dump(mode="json")
        candidate["video_object_path"] = self.current.video_object_path
        candidate.update({**updates, "revision": self.current.revision + 1})
        self.current = PracticalAssessment.model_validate(candidate)
        return self.current

    def complete(
        self,
        *,
        updates: dict[str, Any],
        **_: object,
    ) -> PracticalAssessment:
        return self.update_draft(updates={"status": "completed", **updates})

    def upload_video(
        self,
        *,
        object_path: str,
        **_: object,
    ) -> None:
        self.uploaded_paths.append(object_path)

    def download_video(self, **_: object) -> ValidatedAssessmentVideo:
        if self.downloaded_video is None:
            raise AssertionError("test did not provide a stored work video")
        return self.downloaded_video

    def delete_video(self, *, object_path: str) -> None:
        self.deleted_paths.append(object_path)


def _validated_video(tmp_path: Path) -> ValidatedAssessmentVideo:
    path = tmp_path / "video.mp4"
    data = b"\x00\x00\x00\x18ftypmp42video"
    path.write_bytes(data)
    return ValidatedAssessmentVideo(
        path=path,
        file_name="video.mp4",
        mime_type="video/mp4",
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
    )


def test_start_stores_video_and_generates_questions_only(tmp_path: Path) -> None:
    repository = FakeRepository()
    analyzer = FakeAnalyzer()
    service = PracticalAssessmentService(
        repository=repository,  # type: ignore[arg-type]
        analyzer=analyzer,
    )
    video = _validated_video(tmp_path)

    try:
        assessment = asyncio.run(service.start(_user(), video=video))
    finally:
        video.cleanup()

    assert assessment.video_status == "questions_generated"
    assert len(assessment.questions) == 10
    assert all(answer.answer is None for answer in assessment.answers)
    assert analyzer.question_calls == 1
    assert analyzer.answer_calls == 0
    assert repository.uploaded_paths == [assessment.video_object_path]


def test_start_after_completion_creates_a_new_assessment(tmp_path: Path) -> None:
    previous = _completed_row()
    repository = FakeRepository(previous)
    analyzer = FakeAnalyzer()
    service = PracticalAssessmentService(
        repository=repository,  # type: ignore[arg-type]
        analyzer=analyzer,
    )
    video = _validated_video(tmp_path)

    try:
        assessment = asyncio.run(service.start(_user(), video=video))
    finally:
        video.cleanup()

    assert assessment.id != previous.id
    assert assessment.status == "draft"
    assert repository.created_assessment_ids == [assessment.id]
    assert previous.status == "completed"
    assert previous.evaluation is not None


def test_start_replaces_only_the_existing_draft(tmp_path: Path) -> None:
    existing = _row()
    repository = FakeRepository(existing)
    service = PracticalAssessmentService(
        repository=repository,  # type: ignore[arg-type]
        analyzer=FakeAnalyzer(),
    )
    video = _validated_video(tmp_path)

    try:
        assessment = asyncio.run(service.start(_user(), video=video))
    finally:
        video.cleanup()

    assert assessment.id == existing.id
    assert repository.created_assessment_ids == []
    assert repository.deleted_paths == [existing.video_object_path]


def test_generate_answers_downloads_video_and_keeps_unsupported_answers_empty(
    tmp_path: Path,
) -> None:
    repository = FakeRepository(
        _row(),
        downloaded_video=_validated_video(tmp_path),
    )
    analyzer = FakeAnalyzer()
    service = PracticalAssessmentService(
        repository=repository,  # type: ignore[arg-type]
        analyzer=analyzer,
    )

    assessment = asyncio.run(service.generate_answers(_user(), ASSESSMENT_ID))

    assert assessment.video_status == "answers_generated"
    assert analyzer.answer_calls == 1
    assert analyzer.received_questions == assessment.questions
    assert assessment.answers[0].answer_source == "ai"
    assert assessment.answers[0].answer == "Observed safe isolation"
    assert all(answer.answer is None for answer in assessment.answers[1:])
    assert repository.downloaded_video is not None
    assert not repository.downloaded_video.path.exists()


def test_generate_answers_is_idempotent_after_answers_are_saved() -> None:
    inference = _video_inference()
    current = _row(
        video_status="answers_generated",
        video_analysis=StoredVideoAnalysis(
            **inference.model_dump(),
            analyzed_at=NOW,
        ),
    )
    repository = FakeRepository(current)
    analyzer = FakeAnalyzer()
    service = PracticalAssessmentService(
        repository=repository,  # type: ignore[arg-type]
        analyzer=analyzer,
    )

    assessment = asyncio.run(service.generate_answers(_user(), ASSESSMENT_ID))

    assert assessment is current
    assert analyzer.answer_calls == 0
    assert repository.downloaded_video is None


def test_final_gemini_calls_run_concurrently_and_merge_results(
    tmp_path: Path,
) -> None:
    analyzer = object.__new__(GeminiPracticalAssessmentAnalyzer)
    analyzer._api_key = "test-key"
    analyzer._model = "test-model"
    analyzer._max_output_tokens = 1_000
    analyzer._max_retries = 1
    analyzer._file_timeout = 1
    analyzer._client = SimpleNamespace()
    remote_file = SimpleNamespace(name="files/work-video")
    calls_started = 0
    both_started = asyncio.Event()
    deleted: list[str] = []
    system_instructions: list[str] = []

    async def upload_video(_: object, __: object) -> object:
        return remote_file

    async def delete_video(_: object, remote: object) -> None:
        deleted.append(remote.name)

    async def generate(_: object, __: object, config: object) -> object:
        nonlocal calls_started
        calls_started += 1
        system_instructions.append(config.system_instruction)
        if calls_started == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=0.5)
        schema = config.response_schema
        if schema is GeminiAssessmentResults:
            parsed: object = GeminiAssessmentResults(
                summary="The practical work has useful evidence.",
                question_feedback=[
                    GeminiQuestionFeedback(
                        question_number=number,
                        score=8,
                        feedback="Evidence supports this response.",
                        evidence_basis="both",
                    )
                    for number in range(1, 11)
                ],
                skill_scores=[
                    GeminiSkillScore(
                        competency=competency,
                        score=80,
                        rationale="The work provides relevant evidence.",
                        confidence=75,
                    )
                    for competency in COMPETENCY_IDS
                ],
            )
        else:
            parsed = GeminiAssessmentSuggestions(
                suggestions=[
                    GeminiImprovementSuggestion(
                        priority="medium",
                        competency="testing_verification",
                        title="Record verification",
                        description="Preserve the final readings.",
                        action_steps=["Use a test record"],
                    ),
                    GeminiImprovementSuggestion(
                        priority="low",
                        competency="documentation",
                        title="Label the work",
                        description="Add durable circuit labels.",
                        action_steps=["Create a label schedule"],
                    ),
                ]
            )
        return SimpleNamespace(parsed=parsed)

    analyzer._upload_video = upload_video
    analyzer._delete_remote_file = delete_video
    analyzer._generate_with_retry = generate
    video = _validated_video(tmp_path)
    ready = _row(answers=_answers("Complete answer"))
    language_token = set_response_language("bn")
    try:
        evaluation = asyncio.run(analyzer.evaluate(video, ready))
    finally:
        reset_response_language(language_token)
        video.cleanup()

    assert calls_started == 2
    assert deleted == ["files/work-video"]
    assert len(evaluation.skill_scores) == 6
    assert len(evaluation.suggestions) == 2
    assert len(system_instructions) == 2
    assert all("Bengali script" in value for value in system_instructions)
    assert all("Preserve JSON keys" in value for value in system_instructions)


def test_evaluation_requires_all_ten_nonblank_answers() -> None:
    inference = _video_inference()
    repository = FakeRepository(
        _row(
            video_status="answers_generated",
            video_analysis=StoredVideoAnalysis(
                **inference.model_dump(),
                analyzed_at=NOW,
            ),
        )
    )
    analyzer = FakeAnalyzer()
    service = PracticalAssessmentService(
        repository=repository,  # type: ignore[arg-type]
        analyzer=analyzer,
    )

    with pytest.raises(PracticalAssessmentIncompleteError, match="all ten"):
        asyncio.run(service.evaluate(_user(), ASSESSMENT_ID))
    assert analyzer.evaluation_calls == 0


def test_completed_assessment_answers_are_immutable() -> None:
    repository = FakeRepository(_completed_row())
    service = PracticalAssessmentService(
        repository=repository,  # type: ignore[arg-type]
        analyzer=FakeAnalyzer(),
    )
    request = AssessmentAnswersUpdate(
        answers=[
            {"question_id": question_id, "answer": "Changed answer"}
            for question_id in QUESTION_IDS
        ]
    )

    with pytest.raises(PracticalAssessmentCompletedError, match="cannot be edited"):
        asyncio.run(service.update_answers(_user(), ASSESSMENT_ID, request))
    assert repository.update_payloads == []


def test_user_answers_derive_source_and_completed_result_is_deterministic(
    tmp_path: Path,
) -> None:
    inference = _video_inference()
    ai_answers = _answers()
    ai_answers[0] = AssessmentAnswer(
        question_id=QUESTION_IDS[0],
        answer="Observed safe isolation",
        ai_answer="Observed safe isolation",
        answer_source="ai",
        ai_confidence=82,
        ai_evidence="At 00:08 the worker isolates the supply.",
    )
    repository = FakeRepository(
        _row(
            video_status="answers_generated",
            video_analysis=StoredVideoAnalysis(
                **inference.model_dump(),
                analyzed_at=NOW,
            ),
            answers=ai_answers,
        ),
        downloaded_video=_validated_video(tmp_path),
    )
    score_values = {competency: 80 for competency in COMPETENCY_IDS}
    score_values["safety_procedures"] = 50
    analyzer = FakeAnalyzer(evaluation=_evaluation(score_values))
    service = PracticalAssessmentService(
        repository=repository,  # type: ignore[arg-type]
        analyzer=analyzer,
    )
    submitted = AssessmentAnswersUpdate(
        answers=[
            {
                "question_id": question_id,
                "answer": (
                    "Edited safe isolation" if index == 0 else "Complete answer"
                ),
            }
            for index, question_id in enumerate(QUESTION_IDS)
        ]
    )

    updated = asyncio.run(service.update_answers(_user(), ASSESSMENT_ID, submitted))
    assert updated.answers[0].answer_source == "ai_edited"
    assert updated.answers[1].answer_source == "user"

    completed = asyncio.run(service.evaluate(_user(), ASSESSMENT_ID))

    assert completed.status == "completed"
    assert completed.overall_score == 75
    assert completed.grade == "C"
    assert completed.passed is False
    assert completed.evaluation is not None
    assert "checklist_sections" not in completed.evaluation.model_dump()
    assert [item.competency for item in completed.evaluation.skill_scores] == list(
        COMPETENCY_IDS
    )
    assert completed.evaluation.skill_scores[0].label == "Safety Procedures"


def test_overall_and_safety_thresholds_are_the_only_pass_gates(
    tmp_path: Path,
) -> None:
    passing = {competency: 72 for competency in COMPETENCY_IDS}
    passing["safety_procedures"] = 60
    inference = _video_inference()
    repository = FakeRepository(
        _row(
            video_status="answers_generated",
            video_analysis=StoredVideoAnalysis(
                **inference.model_dump(),
                analyzed_at=NOW,
            ),
            answers=_answers("Complete answer"),
        ),
        downloaded_video=_validated_video(tmp_path),
    )
    service = PracticalAssessmentService(
        repository=repository,  # type: ignore[arg-type]
        analyzer=FakeAnalyzer(evaluation=_evaluation(passing)),
    )

    completed = asyncio.run(service.evaluate(_user(), ASSESSMENT_ID))

    assert completed.overall_score == 70
    assert completed.safety_procedures_score == 60
    assert completed.passed is True


def test_get_endpoint_returns_no_static_questions_without_assessment() -> None:
    class Service:
        async def get_mine(self, _: object) -> None:
            return None

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_practical_assessment_service] = Service
    try:
        response = TestClient(app).get("/api/v1/practical-assessments/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"assessment": None, "questions": []}


def test_history_endpoint_returns_completed_summaries_and_pagination() -> None:
    completed = _completed_row()
    item = PracticalAssessmentHistoryItem.model_validate(
        completed.model_dump(mode="json")
    )
    received: list[tuple[int, int]] = []

    class Service:
        async def get_history(
            self,
            _: object,
            *,
            limit: int,
            offset: int,
        ) -> tuple[list[PracticalAssessmentHistoryItem], int]:
            received.append((limit, offset))
            return [item], 4

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_practical_assessment_service] = Service
    try:
        response = TestClient(app).get(
            "/api/v1/practical-assessments/history?limit=3&offset=0"
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert received == [(3, 0)]
    assert response.json()["total"] == 4
    assert response.json()["has_more"] is True
    assert response.json()["assessments"][0]["id"] == str(ASSESSMENT_ID)
    assert "evaluation" not in response.json()["assessments"][0]


def test_get_assessment_endpoint_reads_the_owned_record_by_id() -> None:
    called: list[UUID] = []

    class Service:
        async def get_by_id(
            self,
            _: object,
            assessment_id: UUID,
        ) -> PracticalAssessment:
            called.append(assessment_id)
            return _completed_row()

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_practical_assessment_service] = Service
    try:
        response = TestClient(app).get(
            f"/api/v1/practical-assessments/{ASSESSMENT_ID}"
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert called == [ASSESSMENT_ID]
    assert response.json()["assessment"]["status"] == "completed"
    assert response.json()["assessment"]["overall_score"] == 80
    assert "video_object_path" not in response.json()["assessment"]


def test_start_endpoint_requires_video() -> None:
    class Service:
        async def start(self, *_: object, **__: object) -> PracticalAssessment:
            raise AssertionError("service must not be called")

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_practical_assessment_service] = Service
    try:
        response = TestClient(app).post("/api/v1/practical-assessments")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


def test_generate_answers_endpoint_calls_staged_service() -> None:
    called: list[UUID] = []

    class Service:
        async def generate_answers(
            self,
            _: object,
            assessment_id: UUID,
        ) -> PracticalAssessment:
            called.append(assessment_id)
            inference = _video_inference()
            return _row(
                video_status="answers_generated",
                video_analysis=StoredVideoAnalysis(
                    **inference.model_dump(),
                    analyzed_at=NOW,
                ),
            )

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_practical_assessment_service] = Service
    try:
        response = TestClient(app).post(
            f"/api/v1/practical-assessments/{ASSESSMENT_ID}/generate-answers"
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert called == [ASSESSMENT_ID]
    assert response.json()["assessment"]["video_status"] == "answers_generated"
    assert "video_object_path" not in response.json()["assessment"]
    assert "personalization_context" not in response.json()["assessment"]
    assert len(response.json()["questions"]) == 10


def test_repository_rejects_stale_compare_and_set(
    tmp_path: Path, db_session: Session
) -> None:
    repository = SQLitePracticalAssessmentRepository(
        session=db_session,
        video_directory=tmp_path / "videos",
    )
    row = _row()
    created = repository.create_draft(
        assessment_id=row.id,
        user_id=row.user_id,
        payload=_row_json(),
    )
    repository.update_draft(
        assessment=created,
        updates={"video_status": "questions_generated"},
    )
    # Trying to update with stale revision (revision 1 instead of 2)
    with pytest.raises(PracticalAssessmentConflictError, match="changed"):
        repository.update_draft(
            assessment=created,
            updates={"video_status": "answers_generated"},
        )
