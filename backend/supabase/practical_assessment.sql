-- ElectroMentor one-time learner-profile assessment migration (v2)
-- Run this entire file in Supabase Dashboard -> SQL Editor.
--
-- This migration is safe to run on a project that already has the earlier
-- work/practical-assessment table. Every non-v2 row is copied, in full, to the
-- locked-down practical_assessment_legacy_archive table before it is removed
-- from the active singleton table. That lets the user complete the new learner
-- profile once without silently treating an old work assessment as profile data.
--
-- Raw video bytes are never stored in Postgres. The active record retains only
-- bounded video metadata, Gemini observations, the ten user-editable answers,
-- and the final structured profile/evaluation.

begin;

create or replace function public.is_practical_assessment_answer_set(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select case
        when jsonb_typeof(value) is distinct from 'array' then false
        when jsonb_array_length(value) <> 10 then false
        -- The API permits bounded Unicode text. Keep a generous byte cap for
        -- multilingual answers and AI provenance while bounding the JSON row.
        when octet_length(value::text) > 600000 then false
        else
            not exists (
                select 1
                from jsonb_array_elements(value) as stored(item)
                where jsonb_typeof(stored.item) <> 'object'
                    or jsonb_typeof(stored.item -> 'question_id')
                        is distinct from 'string'
                    or stored.item ->> 'question_id' not in (
                        'electrical_experience',
                        'training_background',
                        'systems_familiarity',
                        'safety_habits',
                        'tools_familiarity',
                        'troubleshooting_approach',
                        'work_quality_habits',
                        'documentation_habits',
                        'confidence_support_needs',
                        'learning_goals_preferences'
                    )
                    or not (stored.item ? 'answer')
                    or jsonb_typeof(stored.item -> 'answer')
                        not in ('string', 'null')
                    or (
                        jsonb_typeof(stored.item -> 'answer') = 'string'
                        and char_length(stored.item ->> 'answer') > 4000
                    )
            )
            and (
                select count(distinct stored.item ->> 'question_id') = 10
                from jsonb_array_elements(value) as stored(item)
            )
    end;
$$;

create or replace function public.is_practical_assessment_complete_answer_set(
    value jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select case
        when not public.is_practical_assessment_answer_set(value) then false
        else not exists (
                select 1
                from jsonb_array_elements(value) as stored(item)
                where jsonb_typeof(stored.item -> 'answer') <> 'string'
                    or char_length(btrim(stored.item ->> 'answer')) = 0
            )
    end;
$$;

-- Legacy rows are administrative audit data, not an active application model.
-- There is deliberately no authenticated-user policy and the backend secret is
-- granted read-only access after the migration statements finish.
create table if not exists public.practical_assessment_legacy_archive (
    archive_id uuid primary key default gen_random_uuid(),
    source_assessment_id uuid not null unique,
    user_id uuid not null references auth.users(id) on delete cascade,
    source_questionnaire_version text,
    archive_reason text not null
        check (archive_reason in (
            'questionnaire_replaced',
            'invalid_v2_answer_contract',
            'incomplete_completed_v2_profile'
        )),
    snapshot jsonb not null
        check (jsonb_typeof(snapshot) = 'object'),
    archived_at timestamptz not null default now()
);

create index if not exists
    practical_assessment_legacy_archive_user_archived_idx
    on public.practical_assessment_legacy_archive (user_id, archived_at desc);

create table if not exists public.practical_assessments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique
        references auth.users(id) on delete cascade,
    questionnaire_version text not null default 'learner_profile_v2',
    status text not null default 'draft'
        check (status in ('draft', 'completed')),
    video_status text not null default 'not_provided'
        check (video_status in ('not_provided', 'analyzed', 'failed')),
    video_file_name text
        check (
            video_file_name is null
            or char_length(btrim(video_file_name)) between 1 and 255
        ),
    video_mime_type text
        check (
            video_mime_type is null
            or char_length(btrim(video_mime_type)) between 1 and 120
        ),
    video_size_bytes bigint
        check (video_size_bytes is null or video_size_bytes > 0),
    video_sha256 text
        check (video_sha256 is null or video_sha256 ~ '^[0-9a-f]{64}$'),
    video_analysis jsonb
        check (
            video_analysis is null
            or (
                jsonb_typeof(video_analysis) = 'object'
                and octet_length(video_analysis::text) <= 300000
            )
        ),
    answers jsonb not null
        constraint practical_assessments_answers_check
        check (public.is_practical_assessment_answer_set(answers)),
    safety_procedures_score smallint
        check (safety_procedures_score between 0 and 100),
    tool_usage_score smallint
        check (tool_usage_score between 0 and 100),
    technical_knowledge_score smallint
        check (technical_knowledge_score between 0 and 100),
    work_quality_score smallint
        check (work_quality_score between 0 and 100),
    testing_verification_score smallint
        check (testing_verification_score between 0 and 100),
    documentation_score smallint
        check (documentation_score between 0 and 100),
    overall_score smallint
        check (overall_score between 0 and 100),
    grade text
        check (
            grade is null
            or char_length(btrim(grade)) between 1 and 32
        ),
    passed boolean,
    evaluation jsonb
        check (
            evaluation is null
            or (
                jsonb_typeof(evaluation) = 'object'
                and octet_length(evaluation::text) <= 500000
            )
        ),
    personalization_context text
        check (
            personalization_context is null
            or char_length(btrim(personalization_context)) between 1 and 8000
        ),
    revision bigint not null default 1
        check (revision >= 1),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    constraint practical_assessments_questionnaire_version_check
        check (questionnaire_version = 'learner_profile_v2'),
    constraint practical_assessments_video_state_check check (
        (
            video_status = 'not_provided'
            and video_file_name is null
            and video_mime_type is null
            and video_size_bytes is null
            and video_sha256 is null
            and video_analysis is null
        )
        or (
            video_status = 'analyzed'
            and video_file_name is not null
            and video_mime_type is not null
            and video_size_bytes is not null
            and video_sha256 is not null
            and video_analysis is not null
        )
        or (
            video_status = 'failed'
            and video_file_name is not null
            and video_mime_type is not null
            and video_size_bytes is not null
            and video_sha256 is not null
        )
    ),
    constraint practical_assessments_completion_check check (
        (
            status = 'draft'
            and completed_at is null
        )
        or (
            status = 'completed'
            and public.is_practical_assessment_complete_answer_set(answers)
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
            and personalization_context is not null
            and completed_at is not null
        )
    )
);

-- The old trigger makes completed v1 rows immutable. Remove it just for this
-- transactional migration; the stricter v2 trigger is recreated below.
drop trigger if exists enforce_practical_assessments_workflow
    on public.practical_assessments;

-- If this is upgrading an older deployment, preserve every incompatible row
-- before freeing that user's active singleton slot. to_jsonb(row) captures the
-- old topic/project fields as well, before those obsolete columns are dropped.
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
        when assessment.questionnaire_version is distinct from 'learner_profile_v2'
            then 'questionnaire_replaced'
        when not public.is_practical_assessment_answer_set(assessment.answers)
            then 'invalid_v2_answer_contract'
        else 'incomplete_completed_v2_profile'
    end,
    to_jsonb(assessment)
from public.practical_assessments as assessment
where assessment.questionnaire_version is distinct from 'learner_profile_v2'
    or not public.is_practical_assessment_answer_set(assessment.answers)
    or (
        assessment.status = 'completed'
        and not public.is_practical_assessment_complete_answer_set(
            assessment.answers
        )
    )
on conflict (source_assessment_id) do nothing;

delete from public.practical_assessments as assessment
where assessment.questionnaire_version is distinct from 'learner_profile_v2'
    or not public.is_practical_assessment_answer_set(assessment.answers)
    or (
        assessment.status = 'completed'
        and not public.is_practical_assessment_complete_answer_set(
            assessment.answers
        )
    );

-- topic and project_name belonged to the former work-assessment workflow. They
-- must be removed because the learner profile has neither field and new inserts
-- must not be forced to supply placeholder values.
alter table public.practical_assessments
    drop column if exists topic,
    drop column if exists project_name;

-- Reconcile constraints/defaults when this file upgrades the v1 table. Current
-- v2 rows were validated above; incompatible rows now live in the archive.
alter table public.practical_assessments
    drop constraint if exists practical_assessments_questionnaire_version_check,
    drop constraint if exists practical_assessments_answers_check,
    drop constraint if exists practical_assessments_completion_check;

alter table public.practical_assessments
    alter column questionnaire_version set default 'learner_profile_v2',
    alter column questionnaire_version set not null;

alter table public.practical_assessments
    add constraint practical_assessments_questionnaire_version_check
        check (questionnaire_version = 'learner_profile_v2'),
    add constraint practical_assessments_answers_check
        check (public.is_practical_assessment_answer_set(answers)),
    add constraint practical_assessments_completion_check check (
        (
            status = 'draft'
            and completed_at is null
        )
        or (
            status = 'completed'
            and public.is_practical_assessment_complete_answer_set(answers)
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
            and personalization_context is not null
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
            raise exception 'A learner profile must start as a draft'
                using errcode = '23514';
        end if;

        new.questionnaire_version = 'learner_profile_v2';
        new.revision = 1;
        new.created_at = now();
        new.updated_at = now();
        new.completed_at = null;
        return new;
    end if;

    if new.id <> old.id then
        raise exception 'Learner profile ID cannot be changed'
            using errcode = '23514';
    end if;

    if new.user_id <> old.user_id then
        raise exception 'Learner profile owner cannot be changed'
            using errcode = '23514';
    end if;

    if new.questionnaire_version <> old.questionnaire_version then
        raise exception 'Learner profile questionnaire version cannot be changed'
            using errcode = '23514';
    end if;

    if old.status = 'completed' then
        raise exception 'A completed learner profile cannot be changed'
            using errcode = '23514';
    end if;

    if old.status = 'draft' and new.status not in ('draft', 'completed') then
        raise exception 'Invalid learner profile status transition'
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

revoke execute on function public.is_practical_assessment_answer_set(jsonb)
    from public, anon, authenticated;
revoke execute on function public.is_practical_assessment_complete_answer_set(jsonb)
    from public, anon, authenticated;
revoke execute on function public.enforce_practical_assessment_workflow()
    from public, anon, authenticated;
grant execute on function public.is_practical_assessment_answer_set(jsonb)
    to service_role;
grant execute on function public.is_practical_assessment_complete_answer_set(jsonb)
    to service_role;
grant execute on function public.enforce_practical_assessment_workflow()
    to service_role;

alter table public.practical_assessments enable row level security;
alter table public.practical_assessment_legacy_archive enable row level security;

drop policy if exists "Users can read their own practical assessment"
    on public.practical_assessments;

create policy "Users can read their own practical assessment"
    on public.practical_assessments for select to authenticated
    using ((select auth.uid()) = user_id);

-- Browser-facing users can read only their own active profile. All writes go
-- through FastAPI after local JWT verification and use the server-only secret.
revoke all on table public.practical_assessments from anon, authenticated;
grant select on table public.practical_assessments to authenticated;
revoke all on table public.practical_assessments from service_role;
grant select, insert, update on table public.practical_assessments
    to service_role;

-- No browser role can read legacy snapshots, and the backend cannot mutate or
-- delete them. Supabase administrators retain normal owner-level access.
revoke all on table public.practical_assessment_legacy_archive
    from public, anon, authenticated, service_role;
grant select on table public.practical_assessment_legacy_archive
    to service_role;

commit;
