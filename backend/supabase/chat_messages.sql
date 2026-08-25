-- ElectroMentor conversation storage migration
-- Run the entire file once in Supabase Dashboard -> SQL Editor.

create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null default 'New chat'
        check (char_length(btrim(title)) between 1 and 120),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists conversations_id_user_id_idx
    on public.conversations (id, user_id);

-- The ALTER statements make this file upgrade the earlier single-history table
-- without deleting existing messages.
create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null,
    user_id uuid not null references auth.users(id) on delete cascade,
    sequence_no bigint generated always as identity,
    role text not null check (role in ('user', 'assistant')),
    content text not null check (char_length(btrim(content)) > 0),
    sources jsonb not null default '[]'::jsonb
        check (jsonb_typeof(sources) = 'array'),
    created_at timestamptz not null default now(),
    constraint chat_messages_conversation_owner_fkey
        foreign key (conversation_id, user_id)
        references public.conversations (id, user_id)
        on delete cascade
);

alter table public.chat_messages
    add column if not exists conversation_id uuid;
alter table public.chat_messages
    add column if not exists sequence_no bigint generated always as identity;
alter table public.chat_messages
    add column if not exists sources jsonb not null default '[]'::jsonb;

-- Give any rows created by the previous schema one imported conversation per
-- user. This preserves existing history while adding conversation ownership.
insert into public.conversations (user_id, title, created_at, updated_at)
select
    messages.user_id,
    'Imported chat',
    min(messages.created_at),
    max(messages.created_at)
from public.chat_messages as messages
where messages.conversation_id is null
  and not exists (
      select 1
      from public.conversations as existing
      where existing.user_id = messages.user_id
        and existing.title = 'Imported chat'
  )
group by messages.user_id;

update public.chat_messages as messages
set conversation_id = (
    select conversations.id
    from public.conversations as conversations
    where conversations.user_id = messages.user_id
    order by
        (conversations.title = 'Imported chat') desc,
        conversations.created_at asc,
        conversations.id asc
    limit 1
)
where messages.conversation_id is null;

alter table public.chat_messages
    alter column conversation_id set not null;
alter table public.chat_messages
    alter column sources set not null;

-- Older installations do not have the composite ownership FK.
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'chat_messages_conversation_owner_fkey'
          and conrelid = 'public.chat_messages'::regclass
    ) then
        alter table public.chat_messages
            add constraint chat_messages_conversation_owner_fkey
            foreign key (conversation_id, user_id)
            references public.conversations (id, user_id)
            on delete cascade;
    end if;
end
$$;

create index if not exists conversations_user_updated_at_idx
    on public.conversations (user_id, updated_at desc, id desc);

create unique index if not exists chat_messages_conversation_sequence_idx
    on public.chat_messages (conversation_id, sequence_no);

create index if not exists chat_messages_user_conversation_sequence_idx
    on public.chat_messages (user_id, conversation_id, sequence_no desc);

create or replace function public.set_conversation_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row execute function public.set_conversation_updated_at();

create or replace function public.touch_conversation_from_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    update public.conversations
    set updated_at = greatest(updated_at, new.created_at)
    where id = new.conversation_id
      and user_id = new.user_id;
    return new;
end;
$$;

drop trigger if exists touch_conversation_after_message on public.chat_messages;
create trigger touch_conversation_after_message
after insert on public.chat_messages
for each row execute function public.touch_conversation_from_message();

alter table public.conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Users can read their own conversations"
    on public.conversations;
drop policy if exists "Users can create their own conversations"
    on public.conversations;
drop policy if exists "Users can update their own conversations"
    on public.conversations;
drop policy if exists "Users can delete their own conversations"
    on public.conversations;

create policy "Users can read their own conversations"
    on public.conversations for select to authenticated
    using ((select auth.uid()) = user_id);

create policy "Users can create their own conversations"
    on public.conversations for insert to authenticated
    with check ((select auth.uid()) = user_id);

create policy "Users can update their own conversations"
    on public.conversations for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "Users can delete their own conversations"
    on public.conversations for delete to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own chat messages"
    on public.chat_messages;
drop policy if exists "Users can insert their own chat messages"
    on public.chat_messages;

create policy "Users can read their own chat messages"
    on public.chat_messages for select to authenticated
    using (
        (select auth.uid()) = user_id
        and exists (
            select 1
            from public.conversations
            where conversations.id = chat_messages.conversation_id
              and conversations.user_id = (select auth.uid())
        )
    );

create policy "Users can insert their own chat messages"
    on public.chat_messages for insert to authenticated
    with check (
        (select auth.uid()) = user_id
        and exists (
            select 1
            from public.conversations
            where conversations.id = chat_messages.conversation_id
              and conversations.user_id = (select auth.uid())
        )
    );

-- Remove Supabase's default API privileges first. RLS filters rows, while these
-- grants restrict which operations each API role is allowed to attempt at all.
revoke all on table public.conversations from anon, authenticated;
revoke all on table public.chat_messages from anon, authenticated;
revoke all on sequence public.chat_messages_sequence_no_seq
    from anon, authenticated;

grant select, insert, update, delete on table public.conversations
    to authenticated;
grant select, insert on table public.chat_messages
    to authenticated;
grant usage, select on sequence public.chat_messages_sequence_no_seq
    to authenticated;
