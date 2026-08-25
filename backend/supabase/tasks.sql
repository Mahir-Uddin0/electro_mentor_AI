-- ElectroMentor user-owned task tracker migration
-- Run the entire file once in Supabase Dashboard -> SQL Editor.

create table if not exists public.tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null
        check (char_length(btrim(title)) between 1 and 160),
    description text not null default ''
        check (char_length(description) <= 2000),
    status text not null default 'upcoming'
        check (status in ('upcoming', 'in_progress', 'completed')),
    priority text not null default 'medium'
        check (priority in ('high', 'medium', 'low')),
    due_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz
);

create index if not exists tasks_user_status_priority_due_date_idx
    on public.tasks (user_id, status, priority, due_date, updated_at desc);

create or replace function public.enforce_task_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        new.created_at = now();
        new.updated_at = now();
        if new.status = 'completed' then
            new.completed_at = now();
        else
            new.completed_at = null;
        end if;
        return new;
    end if;

    if old.status = 'upcoming'
       and new.status not in ('upcoming', 'in_progress') then
        raise exception 'Task status cannot move from upcoming to %', new.status
            using errcode = '23514';
    elsif old.status = 'in_progress'
          and new.status not in ('in_progress', 'completed') then
        raise exception 'Task status cannot move from in_progress to %', new.status
            using errcode = '23514';
    elsif old.status = 'completed' and new.status <> 'completed' then
        raise exception 'A completed task cannot move back to %', new.status
            using errcode = '23514';
    end if;

    new.created_at = old.created_at;
    new.updated_at = now();
    if new.status = 'completed' then
        new.completed_at = coalesce(old.completed_at, now());
    else
        new.completed_at = null;
    end if;
    return new;
end;
$$;

drop trigger if exists enforce_tasks_workflow on public.tasks;
create trigger enforce_tasks_workflow
before insert or update on public.tasks
for each row execute function public.enforce_task_workflow();

revoke execute on function public.enforce_task_workflow() from public;

alter table public.tasks enable row level security;

drop policy if exists "Users can read their own tasks" on public.tasks;
drop policy if exists "Users can create their own tasks" on public.tasks;
drop policy if exists "Users can update their own tasks" on public.tasks;
drop policy if exists "Users can delete their own tasks" on public.tasks;

create policy "Users can read their own tasks"
    on public.tasks for select to authenticated
    using ((select auth.uid()) = user_id);

create policy "Users can create their own tasks"
    on public.tasks for insert to authenticated
    with check ((select auth.uid()) = user_id);

create policy "Users can update their own tasks"
    on public.tasks for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "Users can delete their own tasks"
    on public.tasks for delete to authenticated
    using ((select auth.uid()) = user_id);

-- RLS limits each authenticated role to its own rows. The anon role gets no
-- table access, even if a future policy is added accidentally.
revoke all on table public.tasks from anon, authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
