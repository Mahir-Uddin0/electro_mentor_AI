-- Run this once in the Supabase SQL editor.
create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('user', 'assistant')),
    content text not null check (char_length(content) > 0),
    created_at timestamptz not null default now()
);

create index if not exists chat_messages_user_created_at_idx
    on public.chat_messages (user_id, created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "Users can read their own chat messages"
    on public.chat_messages;

create policy "Users can read their own chat messages"
    on public.chat_messages
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

grant select on table public.chat_messages to authenticated;
