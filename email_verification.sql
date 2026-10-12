-- Apply after schema.sql, once the server-only Supabase admin key is configured.
-- Existing accounts keep their credentials; newly invited accounts use Supabase Auth.
BEGIN;

ALTER TABLE public.users ALTER COLUMN password DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN password DROP DEFAULT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verification_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.sync_invited_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- The profile and role are written by the authenticated admin API before invitation.
  -- Never create roles from client-editable Auth user metadata.
  UPDATE public.users
  SET auth_user_id = NEW.id, email_verified_at = NEW.email_confirmed_at
  WHERE email_verification_required = true
    AND (auth_user_id = NEW.id OR (auth_user_id IS NULL AND lower(credential) = lower(NEW.email)));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_invited_user() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_citation_invited_user ON auth.users;
CREATE TRIGGER sync_citation_invited_user
AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_invited_user();

-- Passwords, role assignments, and verification state are only accessed by the server.
DROP POLICY IF EXISTS "Allow anon select users" ON public.users;
DROP POLICY IF EXISTS "Allow anon insert users" ON public.users;
DROP POLICY IF EXISTS "Allow anon update users" ON public.users;
DROP POLICY IF EXISTS "Allow anon delete users" ON public.users;
REVOKE ALL ON TABLE public.users FROM anon, authenticated;
GRANT ALL ON TABLE public.users TO service_role;

COMMIT;
