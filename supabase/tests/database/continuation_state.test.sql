begin;

select plan(27);

select set_config('test.continuation_key', 'sessions/' || repeat('a', 64), true);
select set_config('test.handoff_key', 'sessions/' || repeat('a', 64) || '/artifacts/handoff/' || repeat('b', 64), true);
select set_config('test.decisions_key', 'sessions/' || repeat('a', 64) || '/artifacts/decisions/' || repeat('c', 64), true);
select set_config('test.first_owner', repeat('d', 64), true);
select set_config('test.second_owner', repeat('e', 64), true);
select set_config('test.user_record_key', 'user-records/' || repeat('f', 64), true);

select ok((select relrowsecurity from pg_class where oid = 'public.continuation_sessions'::regclass), 'session table has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.continuation_artifacts'::regclass), 'artifact table has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.continuation_user_record_heads'::regclass), 'user record heads have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.continuation_user_record_revisions'::regclass), 'user record revisions have RLS enabled');
select ok(has_function_privilege('service_role', 'public.continuation_commit(integer,jsonb,jsonb)', 'execute'), 'service_role can execute continuation commits');
select ok(not has_function_privilege('anon', 'public.continuation_commit(integer,jsonb,jsonb)', 'execute'), 'anon cannot execute continuation commits');
select ok(has_function_privilege('service_role', 'public.continuation_user_record_commit(text,integer,jsonb)', 'execute'), 'service_role can execute user record commits');
select ok(not has_function_privilege('anon', 'public.continuation_user_record_commit(text,integer,jsonb)', 'execute'), 'anon cannot execute user record commits');

select throws_ok(
  $$select public.continuation_commit(
    null,
    jsonb_build_object(
      'key', current_setting('test.continuation_key'),
      'revision', 1,
      'state', 'active',
      'latest', '{}'::jsonb,
      'events', jsonb_build_array(jsonb_build_object('type', 'saved')),
      'private_note', 'plaintext must not enter the manifest'
    ),
    '[]'::jsonb
  )$$,
  '22023',
  'invalid continuation payload',
  'manifest rejects unknown fields that could expose plaintext'
);

select throws_ok(
  $$select public.continuation_commit(
    null,
    jsonb_build_object(
      'key', current_setting('test.continuation_key'),
      'revision', 1,
      'state', 'active',
      'latest', '{}'::jsonb,
      'events', jsonb_build_array(jsonb_build_object('type', 'saved', 'message', 'plaintext must not enter the event log'))
    ),
    '[]'::jsonb
  )$$,
  '22023',
  'invalid continuation event',
  'event rejects unknown fields that could expose plaintext'
);

select is(
  public.continuation_user_record_commit(
    current_setting('test.user_record_key'),
    null,
    jsonb_build_object('privacy', 'encrypted', 'ciphertext', '-----BEGIN AGE ENCRYPTED FILE-----\nopaque')
  ),
  1,
  'user record commit creates revision one'
);

select is(
  (public.continuation_user_record_load(current_setting('test.user_record_key'))->>'revision')::integer,
  1,
  'user record revision is readable'
);

select throws_ok(
  $$select public.continuation_user_record_commit(
    current_setting('test.user_record_key'),
    null,
    jsonb_build_object('privacy', 'encrypted', 'ciphertext', '-----BEGIN AGE ENCRYPTED FILE-----\nopaque')
  )$$,
  '40001',
  'continuation revision conflict',
  'stale user record compare-and-swap is rejected'
);

select throws_ok(
  $$select public.continuation_user_record_commit(
    current_setting('test.user_record_key'),
    1,
    jsonb_build_object('privacy', 'plaintext', 'ciphertext', 'private content')
  )$$,
  '22023',
  'invalid user record',
  'user record writes reject plaintext content'
);

select is(
  (public.continuation_commit(
    null,
    jsonb_build_object(
      'key', current_setting('test.continuation_key'),
      'revision', 1,
      'state', 'active',
      'latest', jsonb_build_object(current_setting('test.handoff_key'), 1),
      'events', jsonb_build_array(jsonb_build_object('type', 'saved', 'actor', null))
    ),
    jsonb_build_array(jsonb_build_object(
      'key', current_setting('test.handoff_key') || '/revisions/1',
      'kind', 'handoff',
      'revision', 1,
      'privacy', 'encrypted',
      'ciphertext', '-----BEGIN AGE ENCRYPTED FILE-----\nopaque'
    ))
  )->>'revision')::integer,
  1,
  'initial commit creates revision one with a handoff'
);

select is(public.continuation_load(current_setting('test.continuation_key'))->>'state', 'active', 'initial save is readable');
select is(
  (public.continuation_commit(
    1,
    jsonb_build_object(
      'key', current_setting('test.continuation_key'),
      'revision', 2,
      'state', 'active',
      'latest', jsonb_build_object(
        current_setting('test.handoff_key'), 1,
        current_setting('test.decisions_key'), 1
      ),
      'events', jsonb_build_array(
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'saved', 'actor', null)
      )
    ),
    jsonb_build_array(jsonb_build_object(
      'key', current_setting('test.decisions_key') || '/revisions/1',
      'kind', 'decisions',
      'revision', 1,
      'privacy', 'encrypted',
      'ciphertext', '-----BEGIN AGE ENCRYPTED FILE-----\nopaque'
    ))
  )->>'revision')::integer,
  2,
  'a valid compare-and-swap appends a second revision'
);

select throws_ok(
  $$select public.continuation_commit(
    1,
    jsonb_build_object(
      'key', current_setting('test.continuation_key'),
      'revision', 2,
      'state', 'active',
      'latest', jsonb_build_object(current_setting('test.handoff_key'), 1),
      'events', jsonb_build_array(jsonb_build_object('type', 'saved', 'actor', null))
    ),
    '[]'::jsonb
  )$$,
  '40001',
  'continuation revision conflict',
  'a stale compare-and-swap is rejected'
);

select throws_ok(
  format(
    'select public.continuation_commit(2, %L::jsonb, %L::jsonb)',
    jsonb_build_object(
      'key', current_setting('test.continuation_key'),
      'revision', 3,
      'state', 'active',
      'latest', jsonb_build_object(current_setting('test.handoff_key'), 2),
      'events', jsonb_build_array(
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'saved', 'actor', null)
      )
    )::text,
    jsonb_build_array(jsonb_build_object(
      'key', current_setting('test.handoff_key') || '/revisions/2',
      'kind', 'handoff',
      'revision', 2,
      'privacy', 'encrypted',
      'ciphertext', '-----BEGIN AGE ENCRYPTED FILE-----\nopaque'
    ))::text
  ),
  '22023',
  'artifact revisions are append-only',
  'an existing artifact key cannot be removed'
);

select is(
  (select count(*)::integer from public.continuation_artifacts where session_key = current_setting('test.continuation_key')),
  2,
  'only immutable handoff and decisions revisions were stored'
);

select is(
  (public.continuation_commit(
    2,
    jsonb_build_object(
      'key', current_setting('test.continuation_key'),
      'revision', 3,
      'state', 'in-progress',
      'lease', jsonb_build_object(
        'owner', current_setting('test.first_owner'),
        'expiresAt', (extract(epoch from clock_timestamp()) * 1000)::bigint + 1800000
      ),
      'latest', jsonb_build_object(
        current_setting('test.handoff_key'), 1,
        current_setting('test.decisions_key'), 1
      ),
      'events', jsonb_build_array(
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'claimed', 'actor', current_setting('test.first_owner'))
      )
    ),
    '[]'::jsonb
  )->>'state'),
  'in-progress',
  'active session can be claimed with a one-hour lease'
);

select is(
  (public.continuation_commit(
    3,
    jsonb_build_object(
      'key', current_setting('test.continuation_key'),
      'revision', 4,
      'state', 'in-progress',
      'lease', jsonb_build_object(
        'owner', current_setting('test.first_owner'),
        'expiresAt', (extract(epoch from clock_timestamp()) * 1000)::bigint + 1800000
      ),
      'latest', jsonb_build_object(
        current_setting('test.handoff_key'), 1,
        current_setting('test.decisions_key'), 1
      ),
      'events', jsonb_build_array(
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'claimed', 'actor', current_setting('test.first_owner')),
        jsonb_build_object('type', 'renewed', 'actor', current_setting('test.first_owner'))
      )
    ),
    '[]'::jsonb
  )->>'revision')::integer,
  4,
  'current owner can renew an unexpired lease'
);

update public.continuation_sessions
set lease_expires_at = (extract(epoch from clock_timestamp()) * 1000)::bigint - 1,
    manifest = jsonb_set(
      manifest,
      '{lease,expiresAt}',
      to_jsonb((extract(epoch from clock_timestamp()) * 1000)::bigint - 1),
      false
    )
where session_key = current_setting('test.continuation_key');

select throws_ok(
  $$select public.continuation_commit(
    4,
    jsonb_build_object(
      'key', current_setting('test.continuation_key'),
      'revision', 5,
      'state', 'active',
      'latest', jsonb_build_object(
        current_setting('test.handoff_key'), 1,
        current_setting('test.decisions_key'), 1
      ),
      'events', jsonb_build_array(
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'claimed', 'actor', current_setting('test.first_owner')),
        jsonb_build_object('type', 'renewed', 'actor', current_setting('test.first_owner')),
        jsonb_build_object('type', 'saved', 'actor', current_setting('test.first_owner'))
      )
    ),
    '[]'::jsonb
  )$$,
  '22023',
  'invalid continuation state transition',
  'an expired owner cannot save and release an expired claim'
);

select is(
  (public.continuation_commit(
    4,
    jsonb_build_object(
      'key', current_setting('test.continuation_key'),
      'revision', 5,
      'state', 'in-progress',
      'lease', jsonb_build_object(
        'owner', current_setting('test.second_owner'),
        'expiresAt', (extract(epoch from clock_timestamp()) * 1000)::bigint + 1800000
      ),
      'latest', jsonb_build_object(
        current_setting('test.handoff_key'), 1,
        current_setting('test.decisions_key'), 1
      ),
      'events', jsonb_build_array(
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'claimed', 'actor', current_setting('test.first_owner')),
        jsonb_build_object('type', 'renewed', 'actor', current_setting('test.first_owner')),
        jsonb_build_object('type', 'taken-over', 'actor', current_setting('test.second_owner'))
      )
    ),
    '[]'::jsonb
  )->'lease'->>'owner'),
  current_setting('test.second_owner'),
  'a different owner can take over after lease expiry'
);

select is(
  (public.continuation_commit(
    5,
    jsonb_build_object(
      'key', current_setting('test.continuation_key'),
      'revision', 6,
      'state', 'active',
      'latest', jsonb_build_object(
        current_setting('test.handoff_key'), 1,
        current_setting('test.decisions_key'), 1
      ),
      'events', jsonb_build_array(
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'claimed', 'actor', current_setting('test.first_owner')),
        jsonb_build_object('type', 'renewed', 'actor', current_setting('test.first_owner')),
        jsonb_build_object('type', 'taken-over', 'actor', current_setting('test.second_owner')),
        jsonb_build_object('type', 'saved', 'actor', current_setting('test.second_owner'))
      )
    ),
    '[]'::jsonb
  )->>'state'),
  'active',
  'saving releases the current claim'
);

select is(
  (public.continuation_commit(
    6,
    jsonb_build_object(
      'key', current_setting('test.continuation_key'),
      'revision', 7,
      'state', 'inactive',
      'latest', jsonb_build_object(
        current_setting('test.handoff_key'), 1,
        current_setting('test.decisions_key'), 1
      ),
      'events', jsonb_build_array(
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'claimed', 'actor', current_setting('test.first_owner')),
        jsonb_build_object('type', 'renewed', 'actor', current_setting('test.first_owner')),
        jsonb_build_object('type', 'taken-over', 'actor', current_setting('test.second_owner')),
        jsonb_build_object('type', 'saved', 'actor', current_setting('test.second_owner')),
        jsonb_build_object('type', 'resolved', 'actor', null)
      )
    ),
    '[]'::jsonb
  )->>'state'),
  'inactive',
  'resolved sessions move to inactive history'
);

select throws_ok(
  $$select public.continuation_commit(
    7,
    jsonb_build_object(
      'key', current_setting('test.continuation_key'),
      'revision', 8,
      'state', 'active',
      'latest', jsonb_build_object(
        current_setting('test.handoff_key'), 1,
        current_setting('test.decisions_key'), 1
      ),
      'events', jsonb_build_array(
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'saved', 'actor', null),
        jsonb_build_object('type', 'claimed', 'actor', current_setting('test.first_owner')),
        jsonb_build_object('type', 'renewed', 'actor', current_setting('test.first_owner')),
        jsonb_build_object('type', 'taken-over', 'actor', current_setting('test.second_owner')),
        jsonb_build_object('type', 'saved', 'actor', current_setting('test.second_owner')),
        jsonb_build_object('type', 'resolved', 'actor', null),
        jsonb_build_object('type', 'saved', 'actor', null)
      )
    ),
    '[]'::jsonb
  )$$,
  '55000',
  'inactive continuation is immutable',
  'inactive sessions reject further writes'
);

select * from finish();
rollback;
