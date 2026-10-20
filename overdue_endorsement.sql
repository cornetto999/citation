-- Overdue citations: endorsement to PNP for enforcement
-- Run once in the Supabase SQL editor (or: node run-schema.cjs overdue_endorsement.sql)

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS endorsed_at TIMESTAMPTZ;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS endorsed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_tickets_endorsed_at ON public.tickets(endorsed_at);

-- Refresh PostgREST schema cache so the new columns are available immediately
NOTIFY pgrst, 'reload schema';
