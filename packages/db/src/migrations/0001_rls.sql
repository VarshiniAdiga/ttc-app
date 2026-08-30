-- Phase 1 privacy engine: a non-superuser runtime role + row-level security.
-- Access is DEFAULT-DENY. A partner may read a category only when a granted
-- `sharing_consent` row links them. Owners see and manage their own rows.

-- Runtime role the app connects as for user-scoped queries. It cannot bypass
-- RLS and is not the table owner, so every policy below actually binds it.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ttc_app') THEN
    CREATE ROLE ttc_app LOGIN PASSWORD 'ttc_app_dev' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO ttc_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ttc_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ttc_app;--> statement-breakpoint

-- Current request's user id (text), or NULL when the GUC is unset/blank.
CREATE OR REPLACE FUNCTION app_current_user() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '') $$;--> statement-breakpoint

-- SECURITY DEFINER so the consent/couple lookups these helpers run are not
-- themselves subject to RLS (avoids recursion and lets the check see the truth).
CREATE OR REPLACE FUNCTION app_is_partner(owner text, viewer text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM couple c
    WHERE (c.member_a = owner AND c.member_b = viewer)
       OR (c.member_b = owner AND c.member_a = viewer)
  )
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_in_couple(couple_id uuid, viewer text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM couple c
    WHERE c.id = couple_id AND (c.member_a = viewer OR c.member_b = viewer)
  )
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_has_consent(owner text, viewer text, cat consent_category) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM sharing_consent sc
    JOIN couple c ON c.id = sc.couple_id
    WHERE sc.owner_id = owner AND sc.category = cat AND sc.granted
      AND ( (c.member_a = owner AND c.member_b = viewer)
         OR (c.member_b = owner AND c.member_a = viewer) )
  )
$$;--> statement-breakpoint

-- Helper: enable + force RLS, add an owner-full policy and a consent-gated
-- partner SELECT policy for one owner-scoped daily-log table.
DO $$
DECLARE
  t text;
  cat text;
  pairs text[][] := ARRAY[
    ['cycle_log','cycle'], ['bbt_log','bbt'], ['opk_log','opk'],
    ['mucus_log','mucus'], ['symptom_log','symptom'], ['habit_log','habit']
  ];
  p text[];
BEGIN
  FOREACH p SLICE 1 IN ARRAY pairs LOOP
    t := p[1]; cat := p[2];
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (user_id = app_current_user()) WITH CHECK (user_id = app_current_user())',
      t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (app_has_consent(user_id, app_current_user(), %L::consent_category))',
      t || '_partner_read', t, cat);
  END LOOP;
END $$;--> statement-breakpoint

-- profile: owner manages own; partner may read identity (no category needed).
ALTER TABLE profile ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE profile FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY profile_owner ON profile USING (user_id = app_current_user()) WITH CHECK (user_id = app_current_user());--> statement-breakpoint
CREATE POLICY profile_partner_read ON profile FOR SELECT USING (app_is_partner(user_id, app_current_user()));--> statement-breakpoint

-- couple: either member may read their couple row.
ALTER TABLE couple ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE couple FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY couple_members_read ON couple FOR SELECT USING (member_a = app_current_user() OR member_b = app_current_user());--> statement-breakpoint

-- sharing_consent: owner manages their own switches; partner may read what's shared about them.
ALTER TABLE sharing_consent ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sharing_consent FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY sharing_consent_owner ON sharing_consent USING (owner_id = app_current_user()) WITH CHECK (owner_id = app_current_user());--> statement-breakpoint
CREATE POLICY sharing_consent_partner_read ON sharing_consent FOR SELECT USING (app_is_partner(owner_id, app_current_user()));--> statement-breakpoint

-- todo: both couple members read/write.
ALTER TABLE todo ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE todo FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY todo_members ON todo USING (app_in_couple(couple_id, app_current_user())) WITH CHECK (app_in_couple(couple_id, app_current_user()));--> statement-breakpoint

-- coaching: recipient reads own (rows are written by the server-side weekly job).
ALTER TABLE coaching ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE coaching FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY coaching_recipient_read ON coaching FOR SELECT USING (user_id = app_current_user());--> statement-breakpoint

-- entitlement: owner reads own (written by the server-side RevenueCat webhook).
ALTER TABLE entitlement ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE entitlement FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY entitlement_owner_read ON entitlement FOR SELECT USING (user_id = app_current_user());
