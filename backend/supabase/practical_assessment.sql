-- ElectroMentor one-time practical assessment migration
-- Run the entire file in Supabase Dashboard -> SQL Editor.
--
-- Video bytes are deliberately not stored in Postgres. Only bounded metadata,
-- the Gemini video observations, user-editable answers, and the final structured
-- evaluation are retained.

create or replace function public.is_practical_assessment_answer_set(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select case
        when jsonb_typeof(value) <> 'array' then false
        when jsonb_array_length(value) <> 10 then false
        -- The API permits bounded Unicode text; use a byte cap that safely
        -- accommodates multibyte answers while still bounding the JSON row.
        when octet_length(value::text) > 600000 then false
        else not exists (
            select 1
            from jsonb_array_elements(value) as answer(item)
            where jsonb_typeof(answer.item) <> 'object'
        )
    end;
$$;

create table if not exists public.practical_assessments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique
        references auth.users(id) on delete cascade,
    questionnaire_version text not null
        check (char_length(btrim(questionnaire_version)) between 1 and 64),
    topic text not null
        check (char_length(btrim(topic)) between 1 and 120),
    project_name text not null default ''
        check (char_length(project_name) <= 160),
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
                -- Sized for ten bounded multilingual answers/evidence strings.
                and octet_length(video_analysis::text) <= 300000
            )
        ),
    answers jsonb not null
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

drop trigger if exists enforce_practical_assessments_workflow
    on public.practical_assessments;
create trigger enforce_practical_assessments_workflow
before insert or update on public.practical_assessments
for each row execute function public.enforce_practical_assessment_workflow();

revoke execute on function public.is_practical_assessment_answer_set(jsonb)
    from public, anon, authenticated;
revoke execute on function public.enforce_practical_assessment_workflow()
    from public, anon, authenticated;
grant execute on function public.is_practical_assessment_answer_set(jsonb)
    to service_role;

alter table public.practical_assessments enable row level security;

drop policy if exists "Users can read their own practical assessment"
    on public.practical_assessments;

create policy "Users can read their own practical assessment"
    on public.practical_assessments for select to authenticated
    using ((select auth.uid()) = user_id);

-- The browser-facing authenticated role can only read its own row. All writes
-- go through FastAPI after local JWT verification and use the server-only
-- Supabase service-role key. Never expose that key to the frontend.
revoke all on table public.practical_assessments from anon, authenticated;
grant select on table public.practical_assessments to authenticated;
revoke delete on table public.practical_assessments from service_role;
grant select, insert, update on table public.practical_assessments
    to service_role;
