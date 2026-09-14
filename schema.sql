-- Schema for Gitagum Traffic Management System

-- Create Users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    credential TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('enforcer', 'pnp', 'treasury', 'violator', 'admin')),
    unit TEXT NOT NULL
);

-- Create Tickets table
CREATE TABLE IF NOT EXISTS public.tickets (
    id TEXT PRIMARY KEY,
    plate_no TEXT NOT NULL,
    vehicle_type TEXT NOT NULL,
    violator_name TEXT NOT NULL,
    license_no TEXT NOT NULL,
    violations JSONB NOT NULL,
    total_fine INTEGER NOT NULL,
    location TEXT NOT NULL,
    remarks TEXT,
    photo_name TEXT,
    status TEXT NOT NULL CHECK (status IN ('Unpaid', 'Paid', 'Contested', 'Overdue')),
    issued_at TIMESTAMPTZ NOT NULL,
    due_date TIMESTAMPTZ NOT NULL,
    issued_by TEXT NOT NULL
);

-- Create Payments table
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    channel TEXT NOT NULL,
    paid_at TIMESTAMPTZ NOT NULL,
    received_by TEXT NOT NULL,
    or_number TEXT NOT NULL
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon select users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow anon insert users" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update users" ON public.users FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete users" ON public.users FOR DELETE USING (true);

CREATE POLICY "Allow anon select tickets" ON public.tickets FOR SELECT USING (true);
CREATE POLICY "Allow anon insert tickets" ON public.tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update tickets" ON public.tickets FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete tickets" ON public.tickets FOR DELETE USING (true);

CREATE POLICY "Allow anon select payments" ON public.payments FOR SELECT USING (true);
CREATE POLICY "Allow anon insert payments" ON public.payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update payments" ON public.payments FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete payments" ON public.payments FOR DELETE USING (true);

-- Insert Initial Mock Users
INSERT INTO public.users (name, credential, role, unit) VALUES
('Jake Roaya', 'jakeroaya@gmail.com', 'enforcer', 'Gitagum Traffic Management Office'),
('Roaya Jake', 'roayajake@gmail.com', 'pnp', 'Gitagum Municipal Police Station'),
('Francis Jake', 'francisjake@gmail.com', 'treasury', 'Municipal Treasurer''s Office'),
('Juan Reyes', 'juan.reyes@mail.com', 'violator', 'Public Citizen'),
('Admin User', 'admin@gitagum.gov.ph', 'admin', 'LGU Administrator')
ON CONFLICT (credential) DO NOTHING;
