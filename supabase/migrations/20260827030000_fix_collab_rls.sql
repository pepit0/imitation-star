-- Fix infinite RLS recursion between collab_dubs / collab_invites / collab_line_assignments.
-- Policies must not subquery peer tables directly; use SECURITY DEFINER helpers instead.

create or replace function public.is_collab_creator(p_collab_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.collab_dubs cd
    where cd.id = p_collab_id
      and cd.creator_id = p_user_id
  );
$$;

create or replace function public.is_collab_invited(p_collab_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.collab_invites ci
    where ci.collab_id = p_collab_id
      and ci.user_id = p_user_id
  );
$$;

create or replace function public.is_collab_member(p_collab_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_collab_creator(p_collab_id, p_user_id)
    or exists (
      select 1
      from public.collab_invites ci
      where ci.collab_id = p_collab_id
        and ci.user_id = p_user_id
        and ci.status = 'accepted'
    );
$$;

create or replace function public.can_view_collab(p_collab_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_collab_creator(p_collab_id, p_user_id)
    or public.is_collab_invited(p_collab_id, p_user_id);
$$;

drop policy if exists "Collab members can view collab dubs" on public.collab_dubs;
create policy "Collab members can view collab dubs"
  on public.collab_dubs
  for select
  to authenticated
  using (public.can_view_collab(id, auth.uid()));

drop policy if exists "Involved users can view collab invites" on public.collab_invites;
create policy "Involved users can view collab invites"
  on public.collab_invites
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_collab_creator(collab_id, auth.uid())
  );

drop policy if exists "Collab members can view assignments" on public.collab_line_assignments;
create policy "Collab members can view assignments"
  on public.collab_line_assignments
  for select
  to authenticated
  using (
    assignee_id = auth.uid()
    or public.can_view_collab(collab_id, auth.uid())
  );
