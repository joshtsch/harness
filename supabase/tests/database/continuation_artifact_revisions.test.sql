begin;

select plan(9);
select set_config('test.revision_session', 'sessions/' || repeat('1', 64), true);
select set_config('test.revision_handoff', current_setting('test.revision_session') || '/artifacts/handoff/' || repeat('2', 64), true);

-- Exercise the commit RPC with a new immutable handoff revision each time.
create function pg_temp.commit_handoff(p_artifact_revision integer, p_content text default null, p_keep_key boolean default true)
returns jsonb language plpgsql as $$
declare
  previous jsonb := public.continuation_load(current_setting('test.revision_session'));
  expected integer := (previous->>'revision')::integer;
  handoff_key text := current_setting('test.revision_handoff');
begin
  return public.continuation_commit(
    expected,
    jsonb_build_object(
      'key', current_setting('test.revision_session'),
      'revision', coalesce(expected, 0) + 1,
      'state', 'active',
      'latest', case when p_keep_key then jsonb_build_object(handoff_key, p_artifact_revision) else '{}'::jsonb end,
      'events', coalesce(previous->'events', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('type', 'saved', 'actor', null))
    ),
    case when p_content is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'key', handoff_key || '/revisions/' || p_artifact_revision,
      'kind', 'handoff', 'revision', p_artifact_revision,
      'privacy', 'encrypted', 'ciphertext', '-----BEGIN AGE ENCRYPTED FILE-----' || chr(10) || p_content
    )) end
  );
end;
$$;

select lives_ok($$select pg_temp.commit_handoff(1, 'first')$$, 'initial handoff is saved');
select lives_ok($$select pg_temp.commit_handoff(2, 'second')$$, 'a later save appends the next handoff revision');
select is(
  (public.continuation_load(current_setting('test.revision_session'))->'latest'->>current_setting('test.revision_handoff'))::integer,
  2, 'latest handoff advances to revision two'
);
select is(
  public.continuation_read_artifact(current_setting('test.revision_handoff') || '/revisions/1')->>'ciphertext',
  '-----BEGIN AGE ENCRYPTED FILE-----' || chr(10) || 'first', 'prior handoff revision remains readable and unchanged'
);
select is(
  public.continuation_read_artifact(current_setting('test.revision_handoff') || '/revisions/2')->>'ciphertext',
  '-----BEGIN AGE ENCRYPTED FILE-----' || chr(10) || 'second', 'new handoff revision is readable'
);
select throws_ok($$select pg_temp.commit_handoff(1)$$, '22023', 'artifact revisions are append-only', 'latest revision cannot decrease');
select throws_ok($$select pg_temp.commit_handoff(2, null, false)$$, '22023', 'artifact revisions are append-only', 'existing artifact key cannot disappear');
select throws_ok($$select pg_temp.commit_handoff(2, 'replacement')$$, '23505', null, 'stored immutable revision cannot be overwritten');
select throws_ok($$select pg_temp.commit_handoff(3)$$, '22023', 'manifest references an uncommitted artifact', 'latest cannot reference a revision without its artifact');

select * from finish();
rollback;
