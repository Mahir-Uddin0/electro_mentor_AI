-- ElectroMentor practical work-video assessment migration (v4)
-- Run this entire file in Supabase Dashboard -> SQL Editor.
--
-- The migration is safe to run again. Existing learner-profile rows and any
-- incompatible assessment rows are archived before they are removed. Valid
-- completed work assessments remain as user history. Each user may create many
-- completed assessments but may have at most one active draft. Work videos live
-- in a private Storage bucket; Postgres stores only the private object path,
-- generated questions, editable answers, and results.

begin;

create or replace function public.is_practical_assessment_integer(
    value jsonb,
    minimum_value numeric,
    maximum_value numeric
)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select case
        when jsonb_typeof(value) is distinct from 'number' then false
        else
            (value #>> '{}')::numeric = trunc((value #>> '{}')::numeric)
            and (value #>> '{}')::numeric between minimum_value and maximum_value
    end;
$$;

create or replace function public.is_practical_assessment_object_path(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select case
        when value is null then false
        when char_length(value) not between 1 and 1024 then false
        when value like '/%' or value like '%/' then false
        else not exists (
            select 1
            from unnest(string_to_array(value, '/')) as path(part)
            where path.part in ('', '.', '..')
        )
    end;
$$;

create or replace function public.is_practical_assessment_timestamp(value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
    if value is null or value !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?([Zz]|[+-][0-9]{2}:[0-9]{2})$'
    then
        return false;
    end if;

    perform value::timestamptz;
    return true;
exception when others then
    return false;
end;
$$;

create or replace function public.is_practical_assessment_question_set(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select case
        when jsonb_typeof(value) is distinct from 'array' then false
        when jsonb_array_length(value) <> 10 then false
        when octet_length(value::text) > 100000 then false
        else
            not exists (
                select 1
                from jsonb_array_elements(value) as stored(item)
                where jsonb_typeof(stored.item) <> 'object'
                    or jsonb_typeof(stored.item -> 'id') is distinct from 'string'
                    or stored.item ->> 'id' !~ '^question_(0[1-9]|10)$'
                    or jsonb_typeof(stored.item -> 'prompt')
                        is distinct from 'string'
                    or char_length(btrim(stored.item ->> 'prompt'))
                        not between 1 and 1000
                    or not public.is_practical_assessment_integer(
                        stored.item -> 'points',
                        10,
                        10
                    )
                    or jsonb_typeof(stored.item -> 'competency')
                        is distinct from 'string'
                    or stored.item ->> 'competency' not in (
                        'safety_procedures',
                        'tool_usage',
                        'technical_knowledge',
                        'work_quality',
                        'testing_verification',
                        'documentation'
                    )
            )
            and (
                select count(distinct stored.item ->> 'id') = 10
                from jsonb_array_elements(value) as stored(item)
            )
            and (
                select count(distinct stored.item ->> 'competency') = 6
                from jsonb_array_elements(value) as stored(item)
            )
            and (
                select count(distinct lower(btrim(stored.item ->> 'prompt'))) = 10
                from jsonb_array_elements(value) as stored(item)
            )
    end;
$$;

create or replace function public.is_practical_assessment_answer_set(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select case
        when jsonb_typeof(value) is distinct from 'array' then false
        when jsonb_array_length(value) <> 10 then false
        when octet_length(value::text) > 600000 then false
        else
            not exists (
                select 1
                from jsonb_array_elements(value) as stored(item)
                where jsonb_typeof(stored.item) <> 'object'
                    or jsonb_typeof(stored.item -> 'question_id')
                        is distinct from 'string'
                    or stored.item ->> 'question_id'
                        !~ '^question_(0[1-9]|10)$'
                    or not (stored.item ? 'answer')
                    or jsonb_typeof(stored.item -> 'answer')
                        not in ('string', 'null')
                    or (
                        jsonb_typeof(stored.item -> 'answer') = 'string'
                        and char_length(stored.item ->> 'answer') > 4000
                    )
                    or not (stored.item ? 'ai_answer')
                    or jsonb_typeof(stored.item -> 'ai_answer')
                        not in ('string', 'null')
                    or (
                        jsonb_typeof(stored.item -> 'ai_answer') = 'string'
                        and char_length(stored.item ->> 'ai_answer') > 4000
                    )
                    or jsonb_typeof(stored.item -> 'answer_source')
                        is distinct from 'string'
                    or stored.item ->> 'answer_source'
                        not in ('empty', 'ai', 'user', 'ai_edited')
                    or not (stored.item ? 'ai_confidence')
                    or not (
                        jsonb_typeof(stored.item -> 'ai_confidence') = 'null'
                        or public.is_practical_assessment_integer(
                            stored.item -> 'ai_confidence',
                            0,
                            100
                        )
                    )
                    or not (stored.item ? 'ai_evidence')
                    or jsonb_typeof(stored.item -> 'ai_evidence')
                        not in ('string', 'null')
                    or (
                        jsonb_typeof(stored.item -> 'ai_evidence') = 'string'
                        and char_length(stored.item ->> 'ai_evidence') > 1000
                    )
            )
            and (
                select count(distinct stored.item ->> 'question_id') = 10
                from jsonb_array_elements(value) as stored(item)
            )
    end;
$$;

create or replace function public.is_practical_assessment_question_answer_set(
    questions_value jsonb,
    answers_value jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select case
        when not public.is_practical_assessment_question_set(questions_value)
            then false
        when not public.is_practical_assessment_answer_set(answers_value)
            then false
        else not exists (
            select 1
            from jsonb_array_elements(answers_value) as answer(item)
            where not exists (
                select 1
                from jsonb_array_elements(questions_value) as question(item)
                where question.item ->> 'id' = answer.item ->> 'question_id'
            )
        )
    end;
$$;

create or replace function public.is_practical_assessment_complete_answer_set(
    questions_value jsonb,
    answers_value jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select case
        when not public.is_practical_assessment_question_answer_set(
            questions_value,
            answers_value
        ) then false
        else not exists (
            select 1
            from jsonb_array_elements(answers_value) as stored(item)
            where jsonb_typeof(stored.item -> 'answer') <> 'string'
                or char_length(btrim(stored.item ->> 'answer')) = 0
        )
    end;
$$;

create or replace function public.is_practical_assessment_video_analysis(
    questions_value jsonb,
    analysis_value jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select case
        when not public.is_practical_assessment_question_set(questions_value)
            then false
        when jsonb_typeof(analysis_value) is distinct from 'object' then false
        when octet_length(analysis_value::text) > 300000 then false
        when jsonb_typeof(analysis_value -> 'analyzed_at')
            is distinct from 'string' then false
        when not public.is_practical_assessment_timestamp(
            analysis_value ->> 'analyzed_at'
        ) then false
        when jsonb_typeof(analysis_value -> 'answers')
            is distinct from 'array' then false
        when jsonb_array_length(analysis_value -> 'answers') <> 10 then false
        else
            not exists (
                select 1
                from jsonb_array_elements(analysis_value -> 'answers')
                    as stored(item)
                where jsonb_typeof(stored.item) <> 'object'
                    or jsonb_typeof(stored.item -> 'question_id')
                        is distinct from 'string'
                    or not exists (
                        select 1
                        from jsonb_array_elements(questions_value)
                            as question(item)
                        where question.item ->> 'id'
                            = stored.item ->> 'question_id'
                    )
                    or not (stored.item ? 'answer')
                    or jsonb_typeof(stored.item -> 'answer')
                        not in ('string', 'null')
                    or (
                        jsonb_typeof(stored.item -> 'answer') = 'string'
                        and char_length(stored.item ->> 'answer') > 4000
                    )
                    or not public.is_practical_assessment_integer(
                        stored.item -> 'confidence',
                        0,
                        100
                    )
                    or not (stored.item ? 'evidence')
                    or jsonb_typeof(stored.item -> 'evidence')
                        not in ('string', 'null')
                    or (
                        jsonb_typeof(stored.item -> 'evidence') = 'string'
                        and char_length(stored.item ->> 'evidence') > 1000
                    )
            )
            and (
                select count(distinct stored.item ->> 'question_id') = 10
                from jsonb_array_elements(analysis_value -> 'answers')
                    as stored(item)
            )
    end;
$$;

create or replace function public.is_practical_assessment_evaluation(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select case
        when jsonb_typeof(value) is distinct from 'object' then false
        when octet_length(value::text) > 350000 then false
        when jsonb_typeof(value -> 'summary') is distinct from 'string' then false
        when char_length(btrim(value ->> 'summary')) not between 1 and 2000
            then false
        when jsonb_typeof(value -> 'question_feedback')
            is distinct from 'array' then false
        when jsonb_array_length(value -> 'question_feedback') <> 10 then false
        when jsonb_typeof(value -> 'skill_scores') is distinct from 'array'
            then false
        when jsonb_array_length(value -> 'skill_scores') <> 6 then false
        when jsonb_typeof(value -> 'suggestions') is distinct from 'array'
            then false
        when jsonb_array_length(value -> 'suggestions') not between 2 and 6
            then false
        else
            not exists (
                select 1
                from jsonb_array_elements(value -> 'question_feedback')
                    as feedback(item)
                where jsonb_typeof(feedback.item) <> 'object'
                    or jsonb_typeof(feedback.item -> 'question_id')
                        is distinct from 'string'
                    or feedback.item ->> 'question_id'
                        !~ '^question_(0[1-9]|10)$'
                    or not public.is_practical_assessment_integer(
                        feedback.item -> 'score',
                        0,
                        10
                    )
                    or jsonb_typeof(feedback.item -> 'feedback')
                        is distinct from 'string'
                    or char_length(btrim(feedback.item ->> 'feedback'))
                        not between 1 and 1500
                    or jsonb_typeof(feedback.item -> 'evidence_basis')
                        is distinct from 'string'
                    or feedback.item ->> 'evidence_basis' not in (
                        'video',
                        'answer',
                        'both',
                        'insufficient'
                    )
            )
            and (
                select count(distinct feedback.item ->> 'question_id') = 10
                from jsonb_array_elements(value -> 'question_feedback')
                    as feedback(item)
            )
            and not exists (
                select 1
                from jsonb_array_elements(value -> 'skill_scores') as skill(item)
                where jsonb_typeof(skill.item) <> 'object'
                    or jsonb_typeof(skill.item -> 'competency')
                        is distinct from 'string'
                    or skill.item ->> 'competency' not in (
                        'safety_procedures',
                        'tool_usage',
                        'technical_knowledge',
                        'work_quality',
                        'testing_verification',
                        'documentation'
                    )
                    or jsonb_typeof(skill.item -> 'label') is distinct from 'string'
                    or char_length(btrim(skill.item ->> 'label'))
                        not between 1 and 80
                    or not public.is_practical_assessment_integer(
                        skill.item -> 'score',
                        0,
                        100
                    )
                    or jsonb_typeof(skill.item -> 'rationale')
                        is distinct from 'string'
                    or char_length(btrim(skill.item ->> 'rationale'))
                        not between 1 and 1500
                    or not public.is_practical_assessment_integer(
                        skill.item -> 'confidence',
                        0,
                        100
                    )
            )
            and (
                select count(distinct skill.item ->> 'competency') = 6
                from jsonb_array_elements(value -> 'skill_scores') as skill(item)
            )
            and not exists (
                select 1
                from jsonb_array_elements(value -> 'suggestions')
                    as suggestion(item)
                where jsonb_typeof(suggestion.item) <> 'object'
                    or jsonb_typeof(suggestion.item -> 'priority')
                        is distinct from 'string'
                    or suggestion.item ->> 'priority' not in ('high', 'medium', 'low')
                    or jsonb_typeof(suggestion.item -> 'competency')
                        is distinct from 'string'
                    or suggestion.item ->> 'competency' not in (
                        'safety_procedures',
                        'tool_usage',
                        'technical_knowledge',
                        'work_quality',
                        'testing_verification',
                        'documentation'
                    )
                    or jsonb_typeof(suggestion.item -> 'title')
                        is distinct from 'string'
                    or char_length(btrim(suggestion.item ->> 'title'))
                        not between 1 and 160
                    or jsonb_typeof(suggestion.item -> 'description')
                        is distinct from 'string'
                    or char_length(btrim(suggestion.item ->> 'description'))
                        not between 1 and 1500
                    or case
                        when jsonb_typeof(suggestion.item -> 'action_steps')
                            is distinct from 'array' then true
                        when jsonb_array_length(suggestion.item -> 'action_steps')
                            not between 1 and 6 then true
                        else exists (
                            select 1
                            from jsonb_array_elements(
                                suggestion.item -> 'action_steps'
                            ) as action_step(item)
                            where jsonb_typeof(action_step.item)
                                is distinct from 'string'
                                or char_length(btrim(action_step.item #>> '{}')) = 0
                        )
                    end
            )
    end;
$$;

create table if not exists public.practical_assessment_legacy_archive (
    archive_id uuid primary key default gen_random_uuid(),
    source_assessment_id uuid not null unique,
    user_id uuid not null references auth.users(id) on delete cascade,
    source_questionnaire_version text,
    archive_reason text not null,
    snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
    archived_at timestamptz not null default now()
);

alter table public.practical_assessment_legacy_archive
    drop constraint if exists
        practical_assessment_legacy_archive_archive_reason_check;

alter table public.practical_assessment_legacy_archive
    add constraint practical_assessment_legacy_archive_archive_reason_check
    check (archive_reason in (
        'questionnaire_replaced',
        'invalid_v2_answer_contract',
        'incomplete_completed_v2_profile',
        'work_video_workflow_replaced',
        'invalid_work_video_contract',
        'superseded_duplicate_draft'
    ));

create index if not exists
    practical_assessment_legacy_archive_user_archived_idx
    on public.practical_assessment_legacy_archive (user_id, archived_at desc);

create table if not exists public.practical_assessments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    questionnaire_version text not null default 'work_video_v3',
    status text not null default 'draft',
    questions jsonb,
    video_status text not null default 'questions_generated',
    video_file_name text,
    video_mime_type text,
    video_size_bytes bigint,
    video_sha256 text,
    video_object_path text,
    video_analysis jsonb,
    answers jsonb not null,
    safety_procedures_score smallint,
    tool_usage_score smallint,
    technical_knowledge_score smallint,
    work_quality_score smallint,
    testing_verification_score smallint,
    documentation_score smallint,
    overall_score smallint,
    grade text,
    passed boolean,
    evaluation jsonb,
    personalization_context text,
    revision bigint not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz
);

alter table public.practical_assessments
    add column if not exists questions jsonb,
    add column if not exists video_object_path text;

drop trigger if exists enforce_practical_assessments_workflow
    on public.practical_assessments;

create temporary table practical_assessment_invalid_rows (
    id uuid primary key
) on commit drop;

insert into practical_assessment_invalid_rows (id)
select assessment.id
from public.practical_assessments as assessment
where assessment.questionnaire_version is distinct from 'work_video_v3'
    or assessment.status is null
    or assessment.status not in ('draft', 'completed')
    or not public.is_practical_assessment_question_answer_set(
        assessment.questions,
        assessment.answers
    )
    or assessment.video_status is null
    or assessment.video_status not in ('questions_generated', 'answers_generated')
    or assessment.video_file_name is null
    or char_length(btrim(assessment.video_file_name)) not between 1 and 255
    or assessment.video_mime_type is null
    or assessment.video_mime_type not in ('video/mp4', 'video/mov', 'video/webm')
    or assessment.video_size_bytes is null
    or assessment.video_size_bytes not between 1 and 100000000
    or assessment.video_sha256 is null
    or assessment.video_sha256 !~ '^[0-9a-f]{64}$'
    or not public.is_practical_assessment_object_path(
        assessment.video_object_path
    )
    or (
        assessment.video_status = 'questions_generated'
        and assessment.video_analysis is not null
    )
    or (
        assessment.video_status = 'answers_generated'
        and not public.is_practical_assessment_video_analysis(
            assessment.questions,
            assessment.video_analysis
        )
    )
    or assessment.safety_procedures_score is not null
        and assessment.safety_procedures_score not between 0 and 100
    or assessment.tool_usage_score is not null
        and assessment.tool_usage_score not between 0 and 100
    or assessment.technical_knowledge_score is not null
        and assessment.technical_knowledge_score not between 0 and 100
    or assessment.work_quality_score is not null
        and assessment.work_quality_score not between 0 and 100
    or assessment.testing_verification_score is not null
        and assessment.testing_verification_score not between 0 and 100
    or assessment.documentation_score is not null
        and assessment.documentation_score not between 0 and 100
    or assessment.overall_score is not null
        and assessment.overall_score not between 0 and 100
    or assessment.grade is not null
        and assessment.grade not in ('A', 'B', 'C', 'D', 'F')
    or assessment.evaluation is not null
        and not public.is_practical_assessment_evaluation(assessment.evaluation)
    or assessment.personalization_context is not null
        and char_length(btrim(assessment.personalization_context))
            not between 1 and 4000
    or assessment.revision is null
    or assessment.revision < 1
    or assessment.status = 'draft' and assessment.completed_at is not null
    or (
        assessment.status = 'completed'
        and (
            assessment.video_status <> 'answers_generated'
            or not public.is_practical_assessment_complete_answer_set(
                assessment.questions,
                assessment.answers
            )
            or assessment.safety_procedures_score is null
            or assessment.tool_usage_score is null
            or assessment.technical_knowledge_score is null
            or assessment.work_quality_score is null
            or assessment.testing_verification_score is null
            or assessment.documentation_score is null
            or assessment.overall_score is null
            or assessment.grade is null
            or assessment.passed is null
            or not public.is_practical_assessment_evaluation(
                assessment.evaluation
            )
            or assessment.personalization_context is not null
            or assessment.completed_at is null
        )
    );

insert into public.practical_assessment_legacy_archive (
    source_assessment_id,
    user_id,
    source_questionnaire_version,
    archive_reason,
    snapshot
)
select
    assessment.id,
    assessment.user_id,
    assessment.questionnaire_version,
    case
        when assessment.questionnaire_version is distinct from 'work_video_v3'
            then 'work_video_workflow_replaced'
        else 'invalid_work_video_contract'
    end,
    to_jsonb(assessment)
from public.practical_assessments as assessment
join practical_assessment_invalid_rows as invalid
    on invalid.id = assessment.id
on conflict (source_assessment_id) do nothing;

delete from public.practical_assessments as assessment
using practical_assessment_invalid_rows as invalid
where invalid.id = assessment.id;

-- Earlier versions enforced one row per user with a UNIQUE(user_id)
-- constraint. Remove that singleton restriction regardless of the generated
-- constraint name so completed assessments can accumulate as history.
do $migration$
declare
    singleton_constraint record;
begin
    for singleton_constraint in
        select constraint_row.conname
        from pg_catalog.pg_constraint as constraint_row
        join pg_catalog.pg_attribute as attribute_row
            on attribute_row.attrelid = constraint_row.conrelid
            and attribute_row.attnum = constraint_row.conkey[1]
        where constraint_row.conrelid =
                'public.practical_assessments'::regclass
            and constraint_row.contype = 'u'
            and cardinality(constraint_row.conkey) = 1
            and attribute_row.attname = 'user_id'
    loop
        execute format(
            'alter table public.practical_assessments drop constraint %I',
            singleton_constraint.conname
        );
    end loop;
end;
$migration$;

-- A valid installation should already have no more than one draft per user.
-- If the singleton constraint was removed manually, retain the newest draft
-- and archive every older draft before adding the partial unique index.
truncate table practical_assessment_invalid_rows;

insert into practical_assessment_invalid_rows (id)
select ranked.id
from (
    select
        assessment.id,
        row_number() over (
            partition by assessment.user_id
            order by
                assessment.updated_at desc nulls last,
                assessment.created_at desc nulls last,
                assessment.id desc
        ) as draft_number
    from public.practical_assessments as assessment
    where assessment.status = 'draft'
) as ranked
where ranked.draft_number > 1;

insert into public.practical_assessment_legacy_archive (
    source_assessment_id,
    user_id,
    source_questionnaire_version,
    archive_reason,
    snapshot
)
select
    assessment.id,
    assessment.user_id,
    assessment.questionnaire_version,
    'superseded_duplicate_draft',
    to_jsonb(assessment)
from public.practical_assessments as assessment
join practical_assessment_invalid_rows as duplicate_draft
    on duplicate_draft.id = assessment.id
on conflict (source_assessment_id) do nothing;

delete from public.practical_assessments as assessment
using practical_assessment_invalid_rows as duplicate_draft
where duplicate_draft.id = assessment.id;

alter table public.practical_assessments
    drop column if exists topic,
    drop column if exists project_name;

alter table public.practical_assessments
    drop constraint if exists practical_assessments_questionnaire_version_check,
    drop constraint if exists practical_assessments_status_check,
    drop constraint if exists practical_assessments_video_status_check,
    drop constraint if exists practical_assessments_video_state_check,
    drop constraint if exists practical_assessments_questions_check,
    drop constraint if exists practical_assessments_answers_check,
    drop constraint if exists practical_assessments_completion_check,
    drop constraint if exists practical_assessments_video_file_name_check,
    drop constraint if exists practical_assessments_video_mime_type_check,
    drop constraint if exists practical_assessments_video_size_bytes_check,
    drop constraint if exists practical_assessments_video_sha256_check,
    drop constraint if exists practical_assessments_video_object_path_check,
    drop constraint if exists practical_assessments_safety_procedures_score_check,
    drop constraint if exists practical_assessments_tool_usage_score_check,
    drop constraint if exists practical_assessments_technical_knowledge_score_check,
    drop constraint if exists practical_assessments_work_quality_score_check,
    drop constraint if exists practical_assessments_testing_verification_score_check,
    drop constraint if exists practical_assessments_documentation_score_check,
    drop constraint if exists practical_assessments_overall_score_check,
    drop constraint if exists practical_assessments_grade_check,
    drop constraint if exists practical_assessments_evaluation_check,
    drop constraint if exists practical_assessments_personalization_context_check,
    drop constraint if exists practical_assessments_revision_check;

alter table public.practical_assessments
    alter column questionnaire_version set default 'work_video_v3',
    alter column questionnaire_version set not null,
    alter column status set default 'draft',
    alter column status set not null,
    alter column questions set not null,
    alter column video_status set default 'questions_generated',
    alter column video_status set not null,
    alter column video_file_name set not null,
    alter column video_mime_type set not null,
    alter column video_size_bytes set not null,
    alter column video_sha256 set not null,
    alter column video_object_path set not null,
    alter column answers set not null,
    alter column revision set default 1,
    alter column revision set not null;

alter table public.practical_assessments
    add constraint practical_assessments_questionnaire_version_check
        check (questionnaire_version = 'work_video_v3'),
    add constraint practical_assessments_status_check
        check (status in ('draft', 'completed')),
    add constraint practical_assessments_video_status_check
        check (video_status in ('questions_generated', 'answers_generated')),
    add constraint practical_assessments_video_file_name_check
        check (char_length(btrim(video_file_name)) between 1 and 255),
    add constraint practical_assessments_video_mime_type_check
        check (video_mime_type in ('video/mp4', 'video/mov', 'video/webm')),
    add constraint practical_assessments_video_size_bytes_check
        check (video_size_bytes > 0 and video_size_bytes <= 100000000),
    add constraint practical_assessments_video_sha256_check
        check (video_sha256 ~ '^[0-9a-f]{64}$'),
    add constraint practical_assessments_video_object_path_check
        check (public.is_practical_assessment_object_path(video_object_path)),
    add constraint practical_assessments_questions_check
        check (public.is_practical_assessment_question_set(questions)),
    add constraint practical_assessments_answers_check
        check (
            public.is_practical_assessment_question_answer_set(questions, answers)
        ),
    add constraint practical_assessments_video_state_check check (
        (video_status = 'questions_generated' and video_analysis is null)
        or (
            video_status = 'answers_generated'
            and public.is_practical_assessment_video_analysis(
                questions,
                video_analysis
            )
        )
    ),
    add constraint practical_assessments_safety_procedures_score_check
        check (safety_procedures_score between 0 and 100),
    add constraint practical_assessments_tool_usage_score_check
        check (tool_usage_score between 0 and 100),
    add constraint practical_assessments_technical_knowledge_score_check
        check (technical_knowledge_score between 0 and 100),
    add constraint practical_assessments_work_quality_score_check
        check (work_quality_score between 0 and 100),
    add constraint practical_assessments_testing_verification_score_check
        check (testing_verification_score between 0 and 100),
    add constraint practical_assessments_documentation_score_check
        check (documentation_score between 0 and 100),
    add constraint practical_assessments_overall_score_check
        check (overall_score between 0 and 100),
    add constraint practical_assessments_grade_check
        check (grade is null or grade in ('A', 'B', 'C', 'D', 'F')),
    add constraint practical_assessments_evaluation_check
        check (
            evaluation is null
            or public.is_practical_assessment_evaluation(evaluation)
        ),
    add constraint practical_assessments_personalization_context_check check (
        personalization_context is null
        or char_length(btrim(personalization_context)) between 1 and 4000
    ),
    add constraint practical_assessments_revision_check check (revision >= 1),
    add constraint practical_assessments_completion_check check (
        (status = 'draft' and completed_at is null)
        or (
            status = 'completed'
            and video_status = 'answers_generated'
            and public.is_practical_assessment_complete_answer_set(
                questions,
                answers
            )
            and safety_procedures_score is not null
            and tool_usage_score is not null
            and technical_knowledge_score is not null
            and work_quality_score is not null
            and testing_verification_score is not null
            and documentation_score is not null
            and overall_score is not null
            and grade is not null
            and passed is not null
            and evaluation is not null
            and personalization_context is null
            and completed_at is not null
        )
    );

create or replace function public.enforce_practical_assessment_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        if new.status <> 'draft' then
            raise exception 'A practical assessment must start as a draft'
                using errcode = '23514';
        end if;

        new.questionnaire_version = 'work_video_v3';
        new.revision = 1;
        new.created_at = now();
        new.updated_at = now();
        new.completed_at = null;
        return new;
    end if;

    if new.id <> old.id then
        raise exception 'Practical assessment ID cannot be changed'
            using errcode = '23514';
    end if;
    if new.user_id <> old.user_id then
        raise exception 'Practical assessment owner cannot be changed'
            using errcode = '23514';
    end if;
    if new.questionnaire_version <> old.questionnaire_version then
        raise exception 'Assessment workflow version cannot be changed'
            using errcode = '23514';
    end if;
    if old.status = 'completed' then
        raise exception 'A completed practical assessment cannot be changed'
            using errcode = '23514';
    end if;
    if old.status = 'draft' and new.status not in ('draft', 'completed') then
        raise exception 'Invalid practical assessment status transition'
            using errcode = '23514';
    end if;

    new.created_at = old.created_at;
    new.updated_at = now();
    new.revision = old.revision + 1;
    if new.status = 'completed' then
        new.completed_at = now();
    else
        new.completed_at = null;
    end if;
    return new;
end;
$$;

create trigger enforce_practical_assessments_workflow
before insert or update on public.practical_assessments
for each row execute function public.enforce_practical_assessment_workflow();

-- Completed assessments are immutable and remain as history. Only drafts are
-- unique per user, preventing two concurrent in-progress workflows while still
-- permitting any number of completed assessments.
drop index if exists public.practical_assessments_one_draft_per_user_idx;

create unique index practical_assessments_one_draft_per_user_idx
    on public.practical_assessments (user_id)
    where status = 'draft';

create index if not exists practical_assessments_user_history_idx
    on public.practical_assessments (
        user_id,
        completed_at desc,
        created_at desc
    )
    where status = 'completed';

-- Private server-only bucket. The backend secret bypasses Storage RLS; no
-- browser policies are created, so users cannot fetch another user's video.
insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'practical-assessment-videos',
    'practical-assessment-videos',
    false,
    100000000,
    array['video/mp4', 'video/mov', 'video/quicktime', 'video/webm']::text[]
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

revoke execute on function public.is_practical_assessment_integer(
    jsonb,
    numeric,
    numeric
) from public, anon, authenticated;
revoke execute on function public.is_practical_assessment_object_path(text)
    from public, anon, authenticated;
revoke execute on function public.is_practical_assessment_timestamp(text)
    from public, anon, authenticated;
revoke execute on function public.is_practical_assessment_question_set(jsonb)
    from public, anon, authenticated;
revoke execute on function public.is_practical_assessment_answer_set(jsonb)
    from public, anon, authenticated;
revoke execute on function public.is_practical_assessment_question_answer_set(
    jsonb,
    jsonb
) from public, anon, authenticated;
revoke execute on function public.is_practical_assessment_complete_answer_set(
    jsonb,
    jsonb
) from public, anon, authenticated;
revoke execute on function public.is_practical_assessment_video_analysis(
    jsonb,
    jsonb
) from public, anon, authenticated;
revoke execute on function public.is_practical_assessment_evaluation(jsonb)
    from public, anon, authenticated;
revoke execute on function public.enforce_practical_assessment_workflow()
    from public, anon, authenticated;

grant execute on function public.is_practical_assessment_integer(
    jsonb,
    numeric,
    numeric
) to service_role;
grant execute on function public.is_practical_assessment_object_path(text)
    to service_role;
grant execute on function public.is_practical_assessment_timestamp(text)
    to service_role;
grant execute on function public.is_practical_assessment_question_set(jsonb)
    to service_role;
grant execute on function public.is_practical_assessment_answer_set(jsonb)
    to service_role;
grant execute on function public.is_practical_assessment_question_answer_set(
    jsonb,
    jsonb
) to service_role;
grant execute on function public.is_practical_assessment_complete_answer_set(
    jsonb,
    jsonb
) to service_role;
grant execute on function public.is_practical_assessment_video_analysis(
    jsonb,
    jsonb
) to service_role;
grant execute on function public.is_practical_assessment_evaluation(jsonb)
    to service_role;
grant execute on function public.enforce_practical_assessment_workflow()
    to service_role;

alter table public.practical_assessments enable row level security;
alter table public.practical_assessment_legacy_archive enable row level security;

drop policy if exists "Users can read their own practical assessment"
    on public.practical_assessments;

revoke all on table public.practical_assessments
    from public, anon, authenticated;
revoke all on table public.practical_assessments from service_role;
grant select, insert, update on table public.practical_assessments
    to service_role;

revoke all on table public.practical_assessment_legacy_archive
    from public, anon, authenticated, service_role;
grant select on table public.practical_assessment_legacy_archive
    to service_role;

commit;
