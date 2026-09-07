"""Local application database models."""

from datetime import date, datetime

from sqlalchemy import (
    DDL,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(
        String(320, collation="NOCASE"),
        nullable=False,
        unique=True,
        index=True,
    )
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    refresh_sessions: Mapped[list["RefreshSession"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    tasks: Mapped[list["TaskRecord"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    practical_assessments: Mapped[list["PracticalAssessmentRecord"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"
    __table_args__ = (
        Index("refresh_sessions_user_expires_idx", "user_id", "expires_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
    replaced_by_session_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("refresh_sessions.id", ondelete="SET NULL"),
    )

    user: Mapped[User] = relationship(back_populates="refresh_sessions")


class TaskRecord(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(
            "length(trim(title)) BETWEEN 1 AND 160",
            name="tasks_title_length_check",
        ),
        CheckConstraint(
            "length(description) <= 2000",
            name="tasks_description_length_check",
        ),
        CheckConstraint(
            "status IN ('upcoming', 'in_progress', 'completed')",
            name="tasks_status_check",
        ),
        CheckConstraint(
            "priority IN ('high', 'medium', 'low')",
            name="tasks_priority_check",
        ),
        CheckConstraint(
            "(status = 'completed' AND completed_at IS NOT NULL) OR "
            "(status <> 'completed' AND completed_at IS NULL)",
            name="tasks_completion_timestamp_check",
        ),
        Index(
            "tasks_user_status_priority_due_date_idx",
            "user_id",
            "status",
            "priority",
            "due_date",
            "updated_at",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(
        String(2_000),
        nullable=False,
        default="",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="upcoming",
    )
    priority: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="medium",
    )
    due_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    user: Mapped[User] = relationship(back_populates="tasks")


event.listen(
    TaskRecord.__table__,
    "after_create",
    DDL(
        """
        CREATE TRIGGER tasks_status_transition
        BEFORE UPDATE OF status ON tasks
        FOR EACH ROW
        WHEN
            (OLD.status = 'upcoming'
                AND NEW.status NOT IN ('upcoming', 'in_progress'))
            OR (OLD.status = 'in_progress'
                AND NEW.status NOT IN ('in_progress', 'completed'))
            OR (OLD.status = 'completed' AND NEW.status <> 'completed')
        BEGIN
            SELECT RAISE(ABORT, 'invalid task status transition');
        END
        """
    ).execute_if(dialect="sqlite"),
)


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint(
            "length(trim(title)) BETWEEN 1 AND 120",
            name="conversations_title_length_check",
        ),
        UniqueConstraint("id", "user_id", name="conversations_id_user_id_uq"),
        Index(
            "conversations_user_updated_at_idx",
            "user_id",
            "updated_at",
            "id",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False, default="New chat")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    user: Mapped[User] = relationship(back_populates="conversations")
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ChatMessage.sequence_no",
    )


event.listen(
    Conversation.__table__,
    "after_create",
    DDL(
        """
        CREATE TRIGGER conversations_set_updated_at
        BEFORE UPDATE ON conversations
        FOR EACH ROW
        BEGIN
            UPDATE conversations
            SET updated_at = strftime('%%Y-%%m-%%dT%%H:%%M:%%f', 'now')
            WHERE rowid = NEW.rowid;
        END
        """
    ).execute_if(dialect="sqlite"),
)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        ForeignKeyConstraint(
            ["conversation_id", "user_id"],
            ["conversations.id", "conversations.user_id"],
            name="chat_messages_conversation_owner_fkey",
            ondelete="CASCADE",
        ),
        CheckConstraint(
            "role IN ('user', 'assistant')",
            name="chat_messages_role_check",
        ),
        CheckConstraint(
            "length(trim(content)) > 0",
            name="chat_messages_content_check",
        ),
        Index(
            "chat_messages_conversation_sequence_idx",
            "conversation_id",
            "sequence_no",
            unique=True,
        ),
        Index(
            "chat_messages_user_conversation_sequence_idx",
            "user_id",
            "conversation_id",
            "sequence_no",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        String(36),
        nullable=False,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


# Auto-assign sequence_no per conversation and touch parent updated_at.
CHAT_MESSAGES_AUTO_SEQUENCE_TRIGGER_SQL = """
CREATE TRIGGER chat_messages_auto_sequence
AFTER INSERT ON chat_messages
FOR EACH ROW
BEGIN
    UPDATE chat_messages
    SET sequence_no = (
        SELECT COALESCE(MAX(m.sequence_no), 0) + 1
        FROM chat_messages m
        WHERE m.conversation_id = NEW.conversation_id
          AND m.id != NEW.id
    )
    WHERE id = NEW.id;

    UPDATE conversations
    SET updated_at = NEW.created_at
    WHERE id = NEW.conversation_id
      AND user_id = NEW.user_id
      AND updated_at < NEW.created_at;
END
"""


event.listen(
    ChatMessage.__table__,
    "after_create",
    DDL(CHAT_MESSAGES_AUTO_SEQUENCE_TRIGGER_SQL).execute_if(dialect="sqlite"),
)


class PracticalAssessmentRecord(Base):
    __tablename__ = "practical_assessments"
    __table_args__ = (
        CheckConstraint(
            "questionnaire_version = 'work_video_v3'",
            name="practical_assessments_questionnaire_version_check",
        ),
        CheckConstraint(
            "status IN ('draft', 'completed')",
            name="practical_assessments_status_check",
        ),
        CheckConstraint(
            "video_status IN ('questions_generated', 'answers_generated')",
            name="practical_assessments_video_status_check",
        ),
        CheckConstraint(
            "grade IS NULL OR grade IN ('A', 'B', 'C', 'D', 'F')",
            name="practical_assessments_grade_check",
        ),
        CheckConstraint(
            "length(trim(video_file_name)) BETWEEN 1 AND 255",
            name="practical_assessments_video_file_name_check",
        ),
        CheckConstraint(
            "video_mime_type IN ('video/mp4', 'video/mov', 'video/webm')",
            name="practical_assessments_video_mime_type_check",
        ),
        CheckConstraint(
            "video_size_bytes BETWEEN 1 AND 100000000",
            name="practical_assessments_video_size_bytes_check",
        ),
        CheckConstraint(
            "length(video_sha256) = 64 "
            "AND video_sha256 NOT GLOB '*[^0-9a-f]*'",
            name="practical_assessments_video_sha256_check",
        ),
        CheckConstraint(
            "length(video_object_path) BETWEEN 1 AND 1024 "
            "AND video_object_path LIKE user_id || '/' || id || '/%' "
            "AND video_object_path NOT LIKE '/%' "
            "AND video_object_path NOT LIKE '%/' "
            "AND video_object_path NOT LIKE '%//%' "
            "AND video_object_path NOT LIKE '%/./%' "
            "AND video_object_path NOT LIKE '%/../%' "
            "AND instr(video_object_path, '\\') = 0",
            name="practical_assessments_video_object_path_check",
        ),
        CheckConstraint(
            "json_valid(questions) "
            "AND json_type(questions) = 'array' "
            "AND json_array_length(questions) = 10",
            name="practical_assessments_questions_check",
        ),
        CheckConstraint(
            "json_valid(answers) "
            "AND json_type(answers) = 'array' "
            "AND json_array_length(answers) = 10",
            name="practical_assessments_answers_check",
        ),
        CheckConstraint(
            "video_analysis IS NULL OR "
            "(json_valid(video_analysis) AND json_type(video_analysis) = 'object')",
            name="practical_assessments_video_analysis_check",
        ),
        CheckConstraint(
            "(video_status = 'questions_generated' AND video_analysis IS NULL) OR "
            "(video_status = 'answers_generated' AND video_analysis IS NOT NULL)",
            name="practical_assessments_video_state_check",
        ),
        CheckConstraint(
            "safety_procedures_score IS NULL OR "
            "safety_procedures_score BETWEEN 0 AND 100",
            name="practical_assessments_safety_procedures_score_check",
        ),
        CheckConstraint(
            "tool_usage_score IS NULL OR tool_usage_score BETWEEN 0 AND 100",
            name="practical_assessments_tool_usage_score_check",
        ),
        CheckConstraint(
            "technical_knowledge_score IS NULL OR "
            "technical_knowledge_score BETWEEN 0 AND 100",
            name="practical_assessments_technical_knowledge_score_check",
        ),
        CheckConstraint(
            "work_quality_score IS NULL OR work_quality_score BETWEEN 0 AND 100",
            name="practical_assessments_work_quality_score_check",
        ),
        CheckConstraint(
            "testing_verification_score IS NULL OR "
            "testing_verification_score BETWEEN 0 AND 100",
            name="practical_assessments_testing_verification_score_check",
        ),
        CheckConstraint(
            "documentation_score IS NULL OR documentation_score BETWEEN 0 AND 100",
            name="practical_assessments_documentation_score_check",
        ),
        CheckConstraint(
            "overall_score IS NULL OR overall_score BETWEEN 0 AND 100",
            name="practical_assessments_overall_score_check",
        ),
        CheckConstraint(
            "evaluation IS NULL OR "
            "(json_valid(evaluation) AND json_type(evaluation) = 'object')",
            name="practical_assessments_evaluation_check",
        ),
        CheckConstraint(
            "revision >= 1",
            name="practical_assessments_revision_check",
        ),
        CheckConstraint(
            "(status = 'draft' AND completed_at IS NULL) OR ("
            "status = 'completed' "
            "AND video_status = 'answers_generated' "
            "AND safety_procedures_score IS NOT NULL "
            "AND tool_usage_score IS NOT NULL "
            "AND technical_knowledge_score IS NOT NULL "
            "AND work_quality_score IS NOT NULL "
            "AND testing_verification_score IS NOT NULL "
            "AND documentation_score IS NOT NULL "
            "AND overall_score IS NOT NULL "
            "AND grade IS NOT NULL "
            "AND passed IS NOT NULL "
            "AND evaluation IS NOT NULL "
            "AND completed_at IS NOT NULL)",
            name="practical_assessments_completion_check",
        ),
        Index(
            "practical_assessments_one_draft_per_user_idx",
            "user_id",
            unique=True,
            sqlite_where=text("status = 'draft'"),
        ),
        Index(
            "practical_assessments_user_history_idx",
            "user_id",
            "completed_at",
            "created_at",
            sqlite_where=text("status = 'completed'"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    questionnaire_version: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="work_video_v3",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="draft",
    )
    video_status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="questions_generated",
    )
    video_file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    video_mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    video_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    video_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    video_object_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    questions: Mapped[str] = mapped_column(Text, nullable=False)
    video_analysis: Mapped[str | None] = mapped_column(Text)
    answers: Mapped[str] = mapped_column(Text, nullable=False)
    safety_procedures_score: Mapped[int | None] = mapped_column(Integer)
    tool_usage_score: Mapped[int | None] = mapped_column(Integer)
    technical_knowledge_score: Mapped[int | None] = mapped_column(Integer)
    work_quality_score: Mapped[int | None] = mapped_column(Integer)
    testing_verification_score: Mapped[int | None] = mapped_column(Integer)
    documentation_score: Mapped[int | None] = mapped_column(Integer)
    overall_score: Mapped[int | None] = mapped_column(Integer)
    grade: Mapped[str | None] = mapped_column(String(5))
    passed: Mapped[bool | None] = mapped_column(Boolean)
    evaluation: Mapped[str | None] = mapped_column(Text)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    user: Mapped[User] = relationship(back_populates="practical_assessments")


event.listen(
    PracticalAssessmentRecord.__table__,
    "after_create",
    DDL(
        """
        CREATE TRIGGER practical_assessments_completed_immutable
        BEFORE UPDATE ON practical_assessments
        FOR EACH ROW
        WHEN OLD.status = 'completed'
        BEGIN
            SELECT RAISE(ABORT, 'completed practical assessment is immutable');
        END
        """
    ).execute_if(dialect="sqlite"),
)


event.listen(
    PracticalAssessmentRecord.__table__,
    "after_create",
    DDL(
        """
        CREATE TRIGGER practical_assessments_identity_immutable
        BEFORE UPDATE OF id, user_id, questionnaire_version, created_at
        ON practical_assessments
        FOR EACH ROW
        WHEN NEW.id <> OLD.id
          OR NEW.user_id <> OLD.user_id
          OR NEW.questionnaire_version <> OLD.questionnaire_version
          OR NEW.created_at <> OLD.created_at
        BEGIN
            SELECT RAISE(ABORT, 'practical assessment identity is immutable');
        END
        """
    ).execute_if(dialect="sqlite"),
)
