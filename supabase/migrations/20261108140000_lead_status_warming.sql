-- Status leada: Podgrzewanie. Etap otwarty, bez zmiany relacji klient/prospekt.

alter table public.deals drop constraint if exists deals_stage_check;

alter table public.deals
  add constraint deals_stage_check check (stage in (
    'new',
    'contact_attempt',
    'conversation_done',
    'warming',
    'meeting_scheduled',
    'meeting_done',
    'offer_sent',
    'negotiation',
    'unqualified',
    'client',
    'won',
    'lost'
  ));

do $$
declare
  signature text;
  definition text;
begin
  foreach signature in array array[
    'private.change_deal_stage(uuid, uuid, integer, text, text)',
    'private.revert_deal_finalization(uuid, uuid, integer, text, text)',
    'private.dashboard_snapshot(uuid, date, date, uuid, text)'
  ]
  loop
    definition := pg_catalog.pg_get_functiondef(signature::regprocedure);
    definition := replace(definition, '''negotiation''', '''negotiation'', ''warming''');
    execute definition;
  end loop;
end
$$;
