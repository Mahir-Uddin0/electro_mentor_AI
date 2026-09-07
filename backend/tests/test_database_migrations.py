import json
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, inspect

from app.core.config import Settings
from app.db.session import get_database_engine, initialize_database


def test_database_engine_rejects_non_sqlite_urls() -> None:
    with pytest.raises(ValueError, match="must use SQLite"):
        get_database_engine("mysql://database.example.test/electromentor")


def test_initialize_database_upgrades_existing_sqlite_tables_without_data_loss(
    tmp_path,
) -> None:
    database_path = tmp_path / "legacy.db"
    database_url = f"sqlite:///{database_path}"
    engine = create_engine(database_url)
    user_id = str(uuid4())
    conversation_id = str(uuid4())
    message_id = str(uuid4())
    second_message_id = str(uuid4())
    assessment_id = str(uuid4())
    questions = json.dumps([{} for _ in range(10)])
    answers = json.dumps([{} for _ in range(10)])

    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE users (
                id VARCHAR(36) PRIMARY KEY,
                email VARCHAR(320) NOT NULL UNIQUE,
                password_hash VARCHAR(512) NOT NULL,
                display_name VARCHAR(100),
                is_active BOOLEAN NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE conversations (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(120) NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                UNIQUE (id, user_id)
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE chat_messages (
                id VARCHAR(36) PRIMARY KEY,
                conversation_id VARCHAR(36) NOT NULL
                    REFERENCES conversations(id) ON DELETE CASCADE,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                sequence_no INTEGER NOT NULL,
                role VARCHAR(10) NOT NULL,
                content TEXT NOT NULL,
                sources TEXT NOT NULL,
                created_at DATETIME NOT NULL
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE practical_assessments (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                questionnaire_version VARCHAR(32) NOT NULL,
                status VARCHAR(20) NOT NULL,
                video_status VARCHAR(30) NOT NULL,
                video_file_name VARCHAR(255) NOT NULL,
                video_mime_type VARCHAR(50) NOT NULL,
                video_size_bytes INTEGER NOT NULL,
                video_sha256 VARCHAR(64) NOT NULL,
                video_object_path VARCHAR(1024) NOT NULL,
                questions TEXT NOT NULL,
                video_analysis TEXT,
                answers TEXT NOT NULL,
                safety_procedures_score INTEGER,
                tool_usage_score INTEGER,
                technical_knowledge_score INTEGER,
                work_quality_score INTEGER,
                testing_verification_score INTEGER,
                documentation_score INTEGER,
                overall_score INTEGER,
                grade VARCHAR(5),
                passed BOOLEAN,
                evaluation TEXT,
                personalization_context TEXT,
                revision INTEGER NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                completed_at DATETIME
            )
            """
        )
        now = "2026-09-06 12:00:00"
        connection.exec_driver_sql(
            "INSERT INTO users VALUES (?, ?, ?, NULL, 1, ?, ?)",
            (user_id, "learner@example.com", "hash", now, now),
        )
        connection.exec_driver_sql(
            "INSERT INTO conversations VALUES (?, ?, ?, ?, ?)",
            (conversation_id, user_id, "Saved chat", now, now),
        )
        connection.exec_driver_sql(
            "INSERT INTO chat_messages VALUES (?, ?, ?, 1, ?, ?, ?, ?)",
            (
                message_id,
                conversation_id,
                user_id,
                "user",
                "Preserve this message",
                "[]",
                now,
            ),
        )
        connection.exec_driver_sql(
            "INSERT INTO chat_messages VALUES (?, ?, ?, 7, ?, ?, ?, ?)",
            (
                second_message_id,
                conversation_id,
                user_id,
                "assistant",
                "Keep the original sequence gap",
                "[]",
                now,
            ),
        )
        connection.exec_driver_sql(
            """
            INSERT INTO practical_assessments (
                id, user_id, questionnaire_version, status, video_status,
                video_file_name, video_mime_type, video_size_bytes,
                video_sha256, video_object_path, questions, video_analysis,
                answers, revision, created_at, updated_at
            ) VALUES (?, ?, 'work_video_v3', 'draft', 'questions_generated',
                'work.mp4', 'video/mp4', 100, ?, ?, ?, NULL, ?, 1, ?, ?)
            """,
            (
                assessment_id,
                user_id,
                "a" * 64,
                f"{user_id}/{assessment_id}/work.mp4",
                questions,
                answers,
                now,
                now,
            ),
        )

    engine.dispose()
    get_database_engine.cache_clear()
    settings = Settings(database_url=database_url)
    initialize_database(settings)
    initialize_database(settings)

    upgraded = get_database_engine(database_url)
    inspector = inspect(upgraded)
    chat_foreign_keys = inspector.get_foreign_keys("chat_messages")
    assessment_checks = {
        item["name"]
        for item in inspector.get_check_constraints("practical_assessments")
    }
    assessment_columns = {
        item["name"] for item in inspector.get_columns("practical_assessments")
    }

    assert any(
        item["name"] == "chat_messages_conversation_owner_fkey"
        and item["constrained_columns"] == ["conversation_id", "user_id"]
        for item in chat_foreign_keys
    )
    assert "practical_assessments_questions_check" in assessment_checks
    assert "personalization_context" not in assessment_columns

    with upgraded.connect() as connection:
        assert connection.exec_driver_sql(
            "SELECT content FROM chat_messages WHERE id = ?", (message_id,)
        ).scalar_one() == "Preserve this message"
        assert connection.exec_driver_sql(
            "SELECT video_file_name FROM practical_assessments WHERE id = ?",
            (assessment_id,),
        ).scalar_one() == "work.mp4"
        assert connection.exec_driver_sql(
            "SELECT sequence_no FROM chat_messages ORDER BY sequence_no"
        ).scalars().all() == [1, 7]
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []

    get_database_engine.cache_clear()
