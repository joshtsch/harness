create table public.continuation_sessions (
  session_key text primary key check (session_key ~ '^sessions/[0-9a-f]{64}$'),
  revision integer not null check (revision > 0),
  state text not null check (state in ('active', 'in-progress', 'inactive')),
  lease_owner text,
  lease_expires_at bigint,
  manifest jsonb not null,
  updated_at timestamptz not null default now(),
  check (
    (state = 'in-progress' and lease_owner is not null and lease_expires_at is not null)
    or
    (state <> 'in-progress' and lease_owner is null and lease_expires_at is null)
  ),
  check (lease_owner is null or lease_owner ~ '^[0-9a-f]{64}$'),
  check ((manifest->>'key') = session_key),
  check ((manifest->>'revision')::integer = revision),
  check ((manifest->>'state') = state)
);

create table public.continuation_artifacts (
  artifact_key text primary key,
  session_key text not null references public.continuation_sessions(session_key),
  artifact_kind text not null check (artifact_kind in ('manifest', 'handoff', 'decisions', 'outputs', 'evaluation')),
  artifact_revision integer not null check (artifact_revision > 0),
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_key, artifact_kind, artifact_key, artifact_revision),
  check (artifact_key ~ ('^' || session_key || '/artifacts/' || artifact_kind || '/[0-9a-f]{64}/revisions/[1-9][0-9]*$')),
  check (
    jsonb_typeof(content) is not distinct from 'object'
    and content ?& array['privacy', 'ciphertext']
    and content - 'privacy' - 'ciphertext' = '{}'::jsonb
    and jsonb_typeof(content->'privacy') is not distinct from 'string'
    and content->>'privacy' = 'encrypted'
    and jsonb_typeof(content->'ciphertext') is not distinct from 'string'
    and content->>'ciphertext' like '-----BEGIN AGE ENCRYPTED FILE-----%'
  )
);

create index continuation_sessions_state_updated_idx
  on public.continuation_sessions (state, updated_at desc);

create table public.continuation_user_record_heads (
  record_key text primary key check (record_key ~ '^user-records/[0-9a-f]{64}$'),
  revision integer not null check (revision > 0),
  content jsonb not null check (
    jsonb_typeof(content) is not distinct from 'object'
    and content ?& array['privacy', 'ciphertext']
    and content - 'privacy' - 'ciphertext' = '{}'::jsonb
    and jsonb_typeof(content->'privacy') is not distinct from 'string'
    and content->>'privacy' = 'encrypted'
    and jsonb_typeof(content->'ciphertext') is not distinct from 'string'
    and content->>'ciphertext' like '-----BEGIN AGE ENCRYPTED FILE-----%'
  ),
  updated_at timestamptz not null default now()
);

create table public.continuation_user_record_revisions (
  record_key text not null references public.continuation_user_record_heads(record_key),
  revision integer not null check (revision > 0),
  content jsonb not null check (
    jsonb_typeof(content) is not distinct from 'object'
    and content ?& array['privacy', 'ciphertext']
    and content - 'privacy' - 'ciphertext' = '{}'::jsonb
    and jsonb_typeof(content->'privacy') is not distinct from 'string'
    and content->>'privacy' = 'encrypted'
    and jsonb_typeof(content->'ciphertext') is not distinct from 'string'
    and content->>'ciphertext' like '-----BEGIN AGE ENCRYPTED FILE-----%'
  ),
  created_at timestamptz not null default now(),
  primary key (record_key, revision)
);

alter table public.continuation_sessions enable row level security;
alter table public.continuation_artifacts enable row level security;
alter table public.continuation_user_record_heads enable row level security;
alter table public.continuation_user_record_revisions enable row level security;
revoke all on public.continuation_sessions, public.continuation_artifacts,
  public.continuation_user_record_heads, public.continuation_user_record_revisions
  from public, anon, authenticated, service_role;

create function public.continuation_load(p_session_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select s.manifest
  from public.continuation_sessions as s
  where s.session_key = p_session_key
$$;

create function public.continuation_list(p_state text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(s.manifest order by s.updated_at desc), '[]'::jsonb)
  from public.continuation_sessions as s
  where s.state = p_state
$$;

create function public.continuation_read_artifact(p_artifact_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'key', a.artifact_key,
    'kind', a.artifact_kind,
    'revision', a.artifact_revision
  ) || a.content
  from public.continuation_artifacts as a
  where a.artifact_key = p_artifact_key
$$;

create function public.continuation_user_record_load(p_record_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('revision', h.revision, 'content', h.content)
  from public.continuation_user_record_heads as h
  where h.record_key = p_record_key
$$;

create function public.continuation_user_record_commit(
  p_record_key text,
  p_expected_revision integer,
  p_content jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_revision integer;
  v_next_revision integer;
begin
  if p_record_key !~ '^user-records/[0-9a-f]{64}$'
     or jsonb_typeof(p_content) is distinct from 'object'
     or not (p_content ?& array['privacy', 'ciphertext'])
     or p_content - 'privacy' - 'ciphertext' <> '{}'::jsonb
     or jsonb_typeof(p_content->'privacy') is distinct from 'string'
     or p_content->>'privacy' is distinct from 'encrypted'
     or jsonb_typeof(p_content->'ciphertext') is distinct from 'string'
     or p_content->>'ciphertext' not like '-----BEGIN AGE ENCRYPTED FILE-----%' then
    raise exception 'invalid user record' using errcode = '22023';
  end if;

  select h.revision into v_current_revision
  from public.continuation_user_record_heads as h
  where h.record_key = p_record_key
  for update;

  if v_current_revision is distinct from p_expected_revision then
    raise exception 'continuation revision conflict' using errcode = '40001';
  end if;
  v_next_revision := coalesce(v_current_revision, 0) + 1;

  if v_current_revision is null then
    begin
      insert into public.continuation_user_record_heads (record_key, revision, content)
      values (p_record_key, v_next_revision, p_content);
    exception when unique_violation then
      raise exception 'continuation revision conflict' using errcode = '40001';
    end;
  else
    update public.continuation_user_record_heads
      set revision = v_next_revision, content = p_content, updated_at = clock_timestamp()
      where record_key = p_record_key;
  end if;
  insert into public.continuation_user_record_revisions (record_key, revision, content)
    values (p_record_key, v_next_revision, p_content);
  return v_next_revision;
end;
$$;

create function public.continuation_commit(
  p_expected_revision integer,
  p_manifest jsonb,
  p_artifacts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_key text := p_manifest->>'key';
  v_revision integer := (p_manifest->>'revision')::integer;
  v_state text := p_manifest->>'state';
  v_lease_owner text := p_manifest#>>'{lease,owner}';
  v_lease_expires bigint := nullif(p_manifest#>>'{lease,expiresAt}', '')::bigint;
  v_current jsonb;
  v_current_revision integer;
  v_current_state text;
  v_current_owner text;
  v_current_expiry bigint;
  v_events jsonb;
  v_event_count integer;
  v_event_type text;
  v_event_actor text;
  v_artifact jsonb;
  v_content jsonb;
  v_latest record;
begin
  if jsonb_typeof(p_manifest) is distinct from 'object'
     or v_session_key !~ '^sessions/[0-9a-f]{64}$'
     or jsonb_typeof(p_manifest->'key') is distinct from 'string'
     or jsonb_typeof(p_manifest->'revision') is distinct from 'number'
     or v_revision is null
     or jsonb_typeof(p_manifest->'state') is distinct from 'string'
     or v_state is null
     or v_state not in ('active', 'in-progress', 'inactive')
     or not (p_manifest ?& array['key', 'revision', 'state', 'latest', 'events'])
     or p_manifest - 'key' - 'revision' - 'state' - 'lease' - 'latest' - 'events' <> '{}'::jsonb
     or jsonb_typeof(p_manifest->'latest') is distinct from 'object'
     or jsonb_typeof(p_manifest->'events') is distinct from 'array'
     or jsonb_typeof(p_artifacts) is distinct from 'array' then
    raise exception 'invalid continuation payload' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_each(p_manifest->'latest') as latest(key, value)
    where latest.key !~ ('^' || v_session_key || '/artifacts/(handoff|decisions|outputs|evaluation)/[0-9a-f]{64}$')
       or jsonb_typeof(latest.value) is distinct from 'number'
       or latest.value::text !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'invalid continuation artifact index' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_manifest->'events') as event(value)
    where jsonb_typeof(event.value) is distinct from 'object'
       or not (event.value ? 'type')
       or event.value - 'type' - 'at' - 'actor' - 'operationId' <> '{}'::jsonb
       or jsonb_typeof(event.value->'type') is distinct from 'string'
       or event.value->>'type' not in ('saved', 'claimed', 'taken-over', 'renewed', 'resolved', 'superseded')
       or (event.value ? 'at' and (
         jsonb_typeof(event.value->'at') is distinct from 'string'
         or event.value->>'at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
       ))
       or (event.value ? 'actor' and (
         jsonb_typeof(event.value->'actor') not in ('string', 'null')
         or (jsonb_typeof(event.value->'actor') = 'string' and event.value->>'actor' !~ '^[0-9a-f]{64}$')
       ))
       or (event.value ? 'operationId' and (
         jsonb_typeof(event.value->'operationId') is distinct from 'string'
         or event.value->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       ))
  ) then
    raise exception 'invalid continuation event' using errcode = '22023';
  end if;
  if (v_state = 'in-progress') <> (v_lease_owner is not null and v_lease_expires is not null) then
    raise exception 'invalid continuation lease' using errcode = '22023';
  end if;
  if v_state = 'in-progress' and (
       jsonb_typeof(p_manifest->'lease') is distinct from 'object'
       or not ((p_manifest->'lease') ?& array['owner', 'expiresAt'])
       or (p_manifest->'lease') - 'owner' - 'expiresAt' <> '{}'::jsonb
       or jsonb_typeof(p_manifest#>'{lease,owner}') is distinct from 'string'
       or jsonb_typeof(p_manifest#>'{lease,expiresAt}') is distinct from 'number'
     ) then
    raise exception 'invalid continuation lease' using errcode = '22023';
  elsif v_state <> 'in-progress' and p_manifest ? 'lease' then
    raise exception 'invalid continuation lease' using errcode = '22023';
  end if;
  if v_state = 'in-progress'
     and (v_lease_owner !~ '^[0-9a-f]{64}$' or v_lease_expires <= (extract(epoch from clock_timestamp()) * 1000)::bigint
          or v_lease_expires > (extract(epoch from clock_timestamp()) * 1000)::bigint + 3600000) then
    raise exception 'continuation lease must expire within one hour' using errcode = '22023';
  end if;

  select s.manifest, s.revision, s.state, s.lease_owner, s.lease_expires_at
    into v_current, v_current_revision, v_current_state, v_current_owner, v_current_expiry
    from public.continuation_sessions as s
    where s.session_key = v_session_key
    for update;

  v_events := p_manifest->'events';
  v_event_count := jsonb_array_length(v_events);
  if v_event_count = 0 then
    raise exception 'continuation event is required' using errcode = '22023';
  end if;
  v_event_type := v_events->(v_event_count - 1)->>'type';
  v_event_actor := v_events->(v_event_count - 1)->>'actor';

  if v_current is null then
    if p_expected_revision is not null or v_revision <> 1 or v_state <> 'active'
       or v_event_count <> 1 or v_event_type <> 'saved'
       or not exists (select 1 from jsonb_array_elements(p_artifacts) as a where a->>'kind' = 'handoff') then
      raise exception 'initial checkpoint requires revision one and a handoff' using errcode = '22023';
    end if;
    begin
      insert into public.continuation_sessions (session_key, revision, state, manifest)
      values (v_session_key, v_revision, v_state, p_manifest);
    exception when unique_violation then
      raise exception 'continuation revision conflict' using errcode = '40001';
    end;
  else
    if p_expected_revision is null or p_expected_revision <> v_current_revision then
      raise exception 'continuation revision conflict' using errcode = '40001';
    end if;
    if v_current_state = 'inactive' then
      raise exception 'inactive continuation is immutable' using errcode = '55000';
    end if;
    if v_revision <> v_current_revision + 1 then
      raise exception 'continuation revision must advance by one' using errcode = '22023';
    end if;
    if v_event_count <> jsonb_array_length(v_current->'events') + 1
       or (v_events - (v_event_count - 1)) <> v_current->'events' then
      raise exception 'continuation events must append exactly one event' using errcode = '22023';
    end if;
    if not ((p_manifest->'latest') @> (v_current->'latest')) then
      raise exception 'artifact revisions are append-only' using errcode = '22023';
    end if;

    if v_current_state = 'active' and v_state = 'active' and v_event_type = 'saved'
       and v_lease_owner is null then
      null;
    elsif v_current_state = 'active' and v_state = 'in-progress' and v_event_type = 'claimed'
       and v_event_actor = v_lease_owner then
      null;
    elsif v_current_state = 'in-progress' and v_state = 'active' and v_event_type = 'saved'
       and v_lease_owner is null
       and v_event_actor = v_current_owner
       and v_current_expiry > (extract(epoch from clock_timestamp()) * 1000)::bigint then
      null;
    elsif v_current_state = 'in-progress' and v_state = 'in-progress' and v_event_type = 'renewed'
       and v_current_owner = v_lease_owner
       and v_event_actor = v_current_owner
       and v_current_expiry > (extract(epoch from clock_timestamp()) * 1000)::bigint then
      null;
    elsif v_current_state = 'in-progress' and v_state = 'in-progress' and v_event_type = 'taken-over'
       and v_current_expiry <= (extract(epoch from clock_timestamp()) * 1000)::bigint
       and v_current_owner <> v_lease_owner
       and v_event_actor = v_lease_owner then
      null;
    elsif v_current_state = 'in-progress' and v_state = 'inactive'
       and v_event_type in ('resolved', 'superseded')
       and v_event_actor = v_current_owner
       and v_current_expiry > (extract(epoch from clock_timestamp()) * 1000)::bigint
       and v_lease_owner is null then
      null;
    elsif v_current_state = 'active' and v_state = 'inactive'
       and v_event_type in ('resolved', 'superseded')
       and v_lease_owner is null then
      null;
    else
      raise exception 'invalid continuation state transition' using errcode = '22023';
    end if;

    update public.continuation_sessions
      set revision = v_revision,
          state = v_state,
          lease_owner = v_lease_owner,
          lease_expires_at = v_lease_expires,
          manifest = p_manifest,
          updated_at = clock_timestamp()
      where session_key = v_session_key;
  end if;

  for v_artifact in select value from jsonb_array_elements(p_artifacts)
  loop
    v_content := v_artifact - 'key' - 'kind' - 'revision';
    if jsonb_typeof(v_content) is distinct from 'object'
       or not (v_content ?& array['privacy', 'ciphertext'])
       or v_content - 'privacy' - 'ciphertext' <> '{}'::jsonb
       or jsonb_typeof(v_content->'privacy') is distinct from 'string'
       or v_content->>'privacy' <> 'encrypted'
       or jsonb_typeof(v_content->'ciphertext') is distinct from 'string'
       or v_content->>'ciphertext' not like '-----BEGIN AGE ENCRYPTED FILE-----%'
       or v_artifact->>'key' !~ ('^' || v_session_key || '/artifacts/' || (v_artifact->>'kind') || '/[0-9a-f]{64}/revisions/[1-9][0-9]*$')
       or (p_manifest->'latest'->>(regexp_replace(v_artifact->>'key', '/revisions/[1-9][0-9]*$', '')))::integer <> (v_artifact->>'revision')::integer
       or (v_artifact->>'kind') not in ('manifest', 'handoff', 'decisions', 'outputs', 'evaluation') then
      raise exception 'invalid continuation artifact' using errcode = '22023';
    end if;
    insert into public.continuation_artifacts (artifact_key, session_key, artifact_kind, artifact_revision, content)
    values (
      v_artifact->>'key',
      v_session_key,
      v_artifact->>'kind',
      (v_artifact->>'revision')::integer,
      v_content
    );
  end loop;

  for v_latest in select key, value from jsonb_each(p_manifest->'latest')
  loop
    if (v_current->'latest'->v_latest.key) is distinct from v_latest.value
       and not exists (
         select 1
         from jsonb_array_elements(p_artifacts) as a
         where a->>'key' = v_latest.key || '/revisions/' || (v_latest.value #>> '{}')
       ) then
      raise exception 'manifest references an uncommitted artifact' using errcode = '22023';
    end if;
  end loop;

  return p_manifest;
end;
$$;

revoke all on function public.continuation_load(text) from public, anon, authenticated;
revoke all on function public.continuation_list(text) from public, anon, authenticated;
revoke all on function public.continuation_read_artifact(text) from public, anon, authenticated;
revoke all on function public.continuation_user_record_load(text) from public, anon, authenticated;
revoke all on function public.continuation_user_record_commit(text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.continuation_commit(integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.continuation_load(text) to service_role;
grant execute on function public.continuation_list(text) to service_role;
grant execute on function public.continuation_read_artifact(text) to service_role;
grant execute on function public.continuation_user_record_load(text) to service_role;
grant execute on function public.continuation_user_record_commit(text, integer, jsonb) to service_role;
grant execute on function public.continuation_commit(integer, jsonb, jsonb) to service_role;
