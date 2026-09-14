ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('enforcer', 'pnp', 'treasury', 'violator', 'admin'));

INSERT INTO public.users (name, credential, role, unit) VALUES
('Admin User', 'admin@gitagum.gov.ph', 'admin', 'LGU Administrator')
ON CONFLICT (credential) DO NOTHING;
