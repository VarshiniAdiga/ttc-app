-- Phase 9: discreet push notifications. Store one Expo push token per user on
-- their profile (MVP: one device per user). RLS profile_owner already scopes
-- writes to the owner; ttc_app already has table privileges from 0001.
ALTER TABLE profile ADD COLUMN IF NOT EXISTS push_token text;
