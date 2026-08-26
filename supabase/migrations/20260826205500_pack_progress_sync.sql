-- In-progress singleplayer dub saves synced per user across devices.
create table if not exists public.pack_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  pack_id text not null,
  pack_title text not null default '',
  line_index integer not null default 0 check (line_index >= 0),
  takes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);

create index if not exists pack_progress_user_updated_idx
  on public.pack_progress (user_id, updated_at desc);

alter table public.pack_progress enable row level security;

create policy "Users read own pack progress"
  on public.pack_progress for select
  using (auth.uid() = user_id);

create policy "Users insert own pack progress"
  on public.pack_progress for insert
  with check (auth.uid() = user_id);

create policy "Users update own pack progress"
  on public.pack_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own pack progress"
  on public.pack_progress for delete
  using (auth.uid() = user_id);
