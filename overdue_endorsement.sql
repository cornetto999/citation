-- Overdue citations: endorsement to PNP for enforcement
-- Run or rerun in the Supabase SQL editor to add any missing endorsement fields.
-- Alternatively: node run-schema.cjs overdue_endorsement.sql

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS endorsed_at TIMESTAMPTZ;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS endorsed_by TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS endorsement_note TEXT;

CREATE INDEX IF NOT EXISTS idx_tickets_endorsed_at ON public.tickets(endorsed_at);

-- Refresh PostgREST schema cache so the new columns are available immediately
NOTIFY pgrst, 'reload schema';
