BEGIN;
-- Apply after 20261021_workflow.sql. Preserve existing printed QR tokens.
-- Two random UUIDs give legacy records an opaque, 64-character link code.
UPDATE public.tickets
SET access_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE access_token IS NULL OR access_token = '';

CREATE UNIQUE INDEX IF NOT EXISTS tickets_unique_access_token
  ON public.tickets(access_token) WHERE access_token IS NOT NULL;
COMMIT;
