-- Phase 6: single-use, expiring partner invite. Accepting it creates the couple
-- and writes the inviter's chosen consent rows (done server-side, superuser).

CREATE TABLE IF NOT EXISTS invite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  inviter_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamp NOT NULL,
  accepted_by text REFERENCES "user"(id) ON DELETE SET NULL,
  accepted_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

-- ttc_app got default privileges from 0001's ALTER DEFAULT PRIVILEGES, but grant
-- explicitly so this table is covered regardless of who ran the migration.
GRANT SELECT, INSERT, UPDATE, DELETE ON invite TO ttc_app;--> statement-breakpoint

-- RLS: the inviter reads their own invites. Accept is a privileged server-side
-- operation on the superuser connection, so it isn't gated by this policy.
ALTER TABLE invite ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invite FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY invite_owner ON invite USING (inviter_id = app_current_user()) WITH CHECK (inviter_id = app_current_user());
