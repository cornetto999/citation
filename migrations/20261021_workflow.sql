BEGIN;
-- Apply after schema.sql, email_verification.sql and overdue_endorsement.sql.
-- Transactional; fails on legacy duplicate settlements/ORs so they can be reviewed, never deleted.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS disabled_reason text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS issued_by_id uuid;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS client_request_id text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS access_token text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS rule_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS endorsed_at timestamptz;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS endorsed_by text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS endorsement_note text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS received_by_id uuid;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS shift_id uuid;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS request_id text;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM payments GROUP BY ticket_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Review duplicate payments per ticket before applying workflow migration.'; END IF;
 IF EXISTS(SELECT 1 FROM payments GROUP BY lower(trim(or_number)) HAVING count(*)>1) THEN RAISE EXCEPTION 'Review duplicate receipt numbers before applying workflow migration.'; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_settlement ON public.payments(ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_unique_receipt ON public.payments(lower(trim(or_number)));
CREATE UNIQUE INDEX IF NOT EXISTS payments_unique_request ON public.payments(request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tickets_unique_request ON public.tickets(issued_by_id,client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tickets_owner_date ON public.tickets(issued_by_id,issued_at DESC);
CREATE INDEX IF NOT EXISTS tickets_due ON public.tickets(due_date) WHERE status IN ('Unpaid','Overdue');
-- Only unambiguous name matches are backfilled. Unmatched legacy records remain visible to Admin.
UPDATE public.tickets t SET issued_by_id=u.id FROM public.users u WHERE t.issued_by_id IS NULL AND t.issued_by=u.name AND (SELECT count(*) FROM users x WHERE x.name=u.name)=1;
UPDATE public.payments p SET received_by_id=u.id FROM public.users u WHERE p.received_by_id IS NULL AND p.received_by=u.name AND (SELECT count(*) FROM users x WHERE x.name=u.name)=1;
CREATE SEQUENCE IF NOT EXISTS public.citation_number;
SELECT setval('public.citation_number', greatest(coalesce((SELECT max(substring(id from 'CTN-[0-9]{4}-([0-9]+)$')::bigint) FROM tickets),0)+1, (SELECT last_value FROM public.citation_number)), false);

CREATE TABLE IF NOT EXISTS public.workflow_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id text, actor_id uuid, actor_name text NOT NULL,
 action text NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now(), before_data jsonb, after_data jsonb
);
CREATE INDEX IF NOT EXISTS workflow_events_date ON public.workflow_events(created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_events_ticket ON public.workflow_events(ticket_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.cashier_shifts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cashier_id uuid NOT NULL,cashier_name text NOT NULL,
 opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, opening_cash numeric(14,2) NOT NULL CHECK(opening_cash>=0),
 cash_collected numeric(14,2) NOT NULL DEFAULT 0, expected_cash numeric(14,2), counted_cash numeric(14,2), difference numeric(14,2),reason text,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift ON public.cashier_shifts(cashier_id) WHERE status='open';
CREATE TABLE IF NOT EXISTS public.citation_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id text NOT NULL REFERENCES public.tickets(id),assigned_to text,reason text NOT NULL,
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','in_review','resolved')),decision text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_case ON public.citation_cases(ticket_id) WHERE state<>'resolved';
CREATE TABLE IF NOT EXISTS public.payment_attempts (
 ticket_id text PRIMARY KEY REFERENCES public.tickets(id),link_id text UNIQUE,checkout_url text, amount integer NOT NULL,
 status text NOT NULL DEFAULT 'creating',provider_reference text,last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.payment_exceptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id text NOT NULL,provider_reference text UNIQUE, reason text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.workflow_settings (
 version serial PRIMARY KEY,due_days integer NOT NULL CHECK(due_days BETWEEN 1 AND 365),catalog jsonb NOT NULL,
 office_information text NOT NULL DEFAULT '',reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid
);
SELECT setval('public.workflow_settings_version_seq',greatest(2,coalesce((SELECT max(version)+1 FROM workflow_settings),2),(SELECT last_value FROM public.workflow_settings_version_seq)),false);
CREATE TABLE IF NOT EXISTS public.followup_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id text NOT NULL REFERENCES public.tickets(id),note text NOT NULL,
 due_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')),created_by uuid,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.public_lookup_limits (key text PRIMARY KEY,window_start timestamptz NOT NULL DEFAULT now(),attempts integer NOT NULL DEFAULT 0);

CREATE OR REPLACE FUNCTION public.workflow_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE b jsonb; a jsonb; actor uuid; actor_name_value text; ticket text;
BEGIN
 actor := nullif(current_setting('citation.actor',true),'')::uuid;
 SELECT name INTO actor_name_value FROM users WHERE id=actor;
 IF TG_OP<>'INSERT' THEN b:=to_jsonb(OLD)-'photo_name'-'access_token'-'password'-'credential'; END IF;
 IF TG_OP<>'DELETE' THEN a:=to_jsonb(NEW)-'photo_name'-'access_token'-'password'-'credential'; END IF;
 ticket:=CASE WHEN TG_TABLE_NAME='tickets' THEN coalesce(a->>'id',b->>'id') ELSE coalesce(a->>'ticket_id',b->>'ticket_id') END;
 INSERT INTO workflow_events(ticket_id,actor_id,actor_name,action,reason,before_data,after_data)
 VALUES(ticket,actor,coalesce(actor_name_value,nullif(current_setting('citation.actor_name',true),''),'System'),
 coalesce(nullif(current_setting('citation.action',true),''),TG_TABLE_NAME||'.'||lower(TG_OP)),nullif(current_setting('citation.reason',true),''),b,a);
 RETURN coalesce(NEW,OLD);
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['tickets','payments','cashier_shifts','citation_cases','workflow_settings','followup_tasks','users'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS workflow_audit_trigger ON public.%I',t);
 EXECUTE format('CREATE TRIGGER workflow_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.workflow_audit()',t);
 END LOOP;
END $$;

CREATE OR REPLACE VIEW public.workflow_ticket_records AS
 SELECT t.id,t.plate_no,t.vehicle_type,t.violator_name,t.license_no,t.violations,t.total_fine,t.location,t.remarks,
 CASE WHEN t.status='Unpaid' AND t.due_date<now() THEN 'Overdue' ELSE t.status END AS status,
 t.issued_at,t.due_date,t.issued_by,t.issued_by_id,t.endorsed_at,t.endorsed_by,t.endorsement_note,t.rule_version,
 coalesce(length(t.photo_name)>0,false) AS has_photo,
 CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p) END AS payment,
 p.paid_at,p.channel,p.received_by,p.or_number,u.unit
 FROM public.tickets t LEFT JOIN public.payments p ON p.ticket_id=t.id LEFT JOIN public.users u ON u.id=t.issued_by_id;

CREATE OR REPLACE FUNCTION public.workflow_filtered(p_filters jsonb,p_owner uuid DEFAULT NULL)
 RETURNS SETOF public.workflow_ticket_records LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT r.* FROM workflow_ticket_records r WHERE (p_owner IS NULL OR r.issued_by_id=p_owner)
 AND (coalesce(p_filters->>'status','') IN ('','All','all') OR r.status=p_filters->>'status' OR (p_filters->>'status'='outstanding' AND r.status IN ('Unpaid','Overdue')))
 AND (coalesce(p_filters->>'flag','') IN ('','all') OR (p_filters->>'flag' IN ('flagged','true') AND r.endorsed_at IS NOT NULL AND r.status<>'Paid') OR (p_filters->>'flag' IN ('unflagged','false') AND (r.endorsed_at IS NULL OR r.status='Paid')))
 AND (coalesce(p_filters->>'aging','all')='all' OR (p_filters->>'aging'='1-7' AND ceil(extract(epoch FROM now()-r.due_date)/86400) BETWEEN 1 AND 7) OR (p_filters->>'aging'='8-30' AND ceil(extract(epoch FROM now()-r.due_date)/86400) BETWEEN 8 AND 30) OR (p_filters->>'aging'='31+' AND ceil(extract(epoch FROM now()-r.due_date)/86400)>=31))
 AND (coalesce(p_filters->>'issuedBy','')='' OR r.issued_by=p_filters->>'issuedBy' OR r.issued_by_id::text=p_filters->>'issuedBy')
 AND (coalesce(p_filters->>'receivedBy','')='' OR r.received_by=p_filters->>'receivedBy')
 AND (coalesce(p_filters->>'unit','')='' OR r.unit=p_filters->>'unit')
 AND (coalesce(p_filters->>'violation','')='' OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.violations) v WHERE v->>'code'=p_filters->>'violation'))
 AND (coalesce(p_filters->>'channel','') IN ('','all','All') OR r.channel=p_filters->>'channel' OR (p_filters->>'channel'='cash' AND r.channel LIKE 'Cash%') OR (p_filters->>'channel'='online' AND r.channel NOT LIKE 'Cash%'))
 AND (coalesce(p_filters->>'basis','issued')<>'paid' OR r.payment IS NOT NULL)
 AND (coalesce(p_filters->>'from','')='' OR (CASE WHEN p_filters->>'basis'='paid' THEN r.paid_at ELSE r.issued_at END)>=((p_filters->>'from')::date::timestamp AT TIME ZONE 'Asia/Manila'))
 AND (coalesce(p_filters->>'to','')='' OR (CASE WHEN p_filters->>'basis'='paid' THEN r.paid_at ELSE r.issued_at END)<(((p_filters->>'to')::date+1)::timestamp AT TIME ZONE 'Asia/Manila'))
 AND (coalesce(p_filters->>'query','')='' OR position(lower(p_filters->>'query') IN lower(concat_ws(' ',r.id,r.violator_name,r.license_no,r.or_number)))>0 OR position(regexp_replace(lower(p_filters->>'query'),'[^a-z0-9]','','g') IN regexp_replace(lower(r.plate_no),'[^a-z0-9]','','g'))>0)
$$;
CREATE OR REPLACE FUNCTION public.workflow_list(p_filters jsonb,p_owner uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 WITH matching AS MATERIALIZED (SELECT * FROM workflow_filtered(p_filters,p_owner)),
 page_rows AS (SELECT * FROM matching ORDER BY CASE WHEN p_filters->>'priority'='flagged' THEN (endorsed_at IS NOT NULL AND status<>'Paid') END DESC,CASE WHEN p_filters->>'priority'='flagged' THEN due_date END ASC,CASE WHEN p_filters->>'basis'='paid' THEN paid_at ELSE issued_at END DESC,id DESC LIMIT least(100,greatest(1,coalesce((p_filters->>'pageSize')::int,25))) OFFSET (greatest(1,coalesce((p_filters->>'page')::int,1))-1)*least(100,greatest(1,coalesce((p_filters->>'pageSize')::int,25))))
 SELECT jsonb_build_object('tickets',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM page_rows p),'[]'::jsonb),
 'total',count(*),'page',greatest(1,coalesce((p_filters->>'page')::int,1)),'pageSize',least(100,greatest(1,coalesce((p_filters->>'pageSize')::int,25))),
 'totalFine',coalesce(sum(total_fine),0),'totalAmount',coalesce(sum((payment->>'amount')::numeric),0),'collectionTotal',coalesce(sum((payment->>'amount')::numeric),0),
 'cashAmount',coalesce(sum((payment->>'amount')::numeric) FILTER(WHERE channel LIKE 'Cash%'),0),
 'onlineAmount',coalesce(sum((payment->>'amount')::numeric) FILTER(WHERE channel NOT LIKE 'Cash%'),0),
 'cashiers',coalesce((SELECT jsonb_agg(DISTINCT received_by) FROM workflow_ticket_records WHERE received_by IS NOT NULL),'[]'::jsonb)) FROM matching
$$;

CREATE OR REPLACE FUNCTION public.workflow_action(p_actor uuid,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE u users; t tickets; s cashier_shifts; c citation_cases; f followup_tasks; setting workflow_settings; result jsonb; ident text; fine integer; opening numeric;
BEGIN
 SELECT * INTO u FROM users WHERE id=p_actor AND active FOR SHARE;
 IF u.id IS NULL THEN RAISE EXCEPTION 'Account is inactive'; END IF;
 PERFORM set_config('citation.actor',p_actor::text,true); PERFORM set_config('citation.action',p_action,true); PERFORM set_config('citation.reason',coalesce(p_data->>'reason',p_data->>'endorsementNote',''),true);
 IF p_action='issue' THEN
  IF u.role<>'enforcer' THEN RAISE EXCEPTION 'Only enforcers may issue citations'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||(p_data->>'clientRequestId'),0));
  SELECT * INTO t FROM tickets WHERE issued_by_id=p_actor AND client_request_id=p_data->>'clientRequestId';
  IF t.id IS NOT NULL THEN RETURN to_jsonb(t); END IF;
  SELECT * INTO setting FROM workflow_settings ORDER BY version DESC LIMIT 1;
  IF (p_data->>'ruleVersion')::int IS DISTINCT FROM coalesce(setting.version,1) THEN RAISE EXCEPTION 'Citation rules changed. Review the current fine before issuing'; END IF;
  SELECT sum((v->>'fine')::int) INTO fine FROM jsonb_array_elements(p_data->'violations') v;
  IF fine IS NULL OR fine<=0 THEN RAISE EXCEPTION 'A valid violation is required'; END IF;
  ident:=nextval('citation_number')::text;
  ident:='CTN-'||to_char(now() AT TIME ZONE 'Asia/Manila','YYYY')||'-'||lpad(ident,greatest(6,length(ident)),'0');
  INSERT INTO tickets(id,plate_no,vehicle_type,violator_name,license_no,violations,total_fine,location,remarks,photo_name,status,issued_at,due_date,issued_by,issued_by_id,client_request_id,access_token,rule_version)
  VALUES(ident,p_data->>'plateNo',p_data->>'vehicleType',p_data->>'violatorName',p_data->>'licenseNo',p_data->'violations',fine,p_data->>'location',p_data->>'remarks',p_data->>'photoData','Unpaid',now(),now()+make_interval(days=>coalesce(setting.due_days,7)),u.name,u.id,p_data->>'clientRequestId',p_data->>'accessToken',coalesce(setting.version,1)) RETURNING * INTO t;
  RETURN to_jsonb(t);
 ELSIF p_action IN ('endorse','withdraw','status') THEN
  IF u.role NOT IN ('admin','treasury') THEN RAISE EXCEPTION 'Only Admin or Treasury can review endorsements'; END IF;
  SELECT * INTO t FROM tickets WHERE id=p_data->>'ticketId' FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Citation not found'; END IF;
  IF p_action='endorse' THEN
   IF NOT(t.status IN ('Unpaid','Overdue') AND t.due_date<now()) THEN RAISE EXCEPTION 'Only overdue, unsettled citations can be endorsed'; END IF;
   IF t.endorsed_at IS NOT NULL THEN RETURN to_jsonb(t); END IF;
   UPDATE tickets SET endorsed_at=now(),endorsed_by=u.name,endorsement_note=p_data->>'endorsementNote' WHERE id=t.id RETURNING * INTO t;
  ELSIF p_action='withdraw' THEN
   UPDATE tickets SET endorsed_at=NULL,endorsed_by=NULL,endorsement_note=NULL WHERE id=t.id RETURNING * INTO t;
  ELSE
   IF u.role<>'admin' OR p_data->>'status' NOT IN ('Unpaid','Contested') OR t.status='Paid' THEN RAISE EXCEPTION 'Settlements cannot be edited through case status'; END IF;
   UPDATE tickets SET status=p_data->>'status' WHERE id=t.id RETURNING * INTO t;
  END IF;
  RETURN to_jsonb(t);
 ELSIF p_action='shift.open' THEN
  IF u.role<>'treasury' THEN RAISE EXCEPTION 'Only Treasury can open cashier shifts'; END IF;
  INSERT INTO cashier_shifts(cashier_id,cashier_name,opening_cash) VALUES(u.id,u.name,(p_data->>'openingCash')::numeric) RETURNING * INTO s;
  RETURN to_jsonb(s);
 ELSIF p_action='shift.close' THEN
  SELECT * INTO s FROM cashier_shifts WHERE id=(p_data->>'shiftId')::uuid AND cashier_id=u.id AND status='open' FOR UPDATE;
  IF s.id IS NULL OR u.role<>'treasury' THEN RAISE EXCEPTION 'Open cashier shift not found'; END IF;
  SELECT coalesce(sum(amount),0) INTO s.cash_collected FROM payments WHERE shift_id=s.id AND channel='Cash (Over-the-counter)';
  s.expected_cash:=s.opening_cash+s.cash_collected;
  s.counted_cash:=(p_data->>'countedCash')::numeric;
  IF s.counted_cash<0 THEN RAISE EXCEPTION 'Counted cash cannot be negative'; END IF;
  s.difference:=s.counted_cash-s.expected_cash;
  IF s.difference<>0 AND length(trim(coalesce(p_data->>'reason','')))<3 THEN RAISE EXCEPTION 'Explain the cash difference before closing'; END IF;
  UPDATE cashier_shifts SET status='closed',closed_at=now(),cash_collected=s.cash_collected,expected_cash=s.expected_cash,counted_cash=s.counted_cash,difference=s.difference,reason=p_data->>'reason' WHERE id=s.id RETURNING * INTO s;
  RETURN to_jsonb(s);
 ELSIF p_action IN ('case.open','case.update') THEN
  IF u.role<>'admin' THEN RAISE EXCEPTION 'Only Admin can manage cases'; END IF;
  IF p_action='case.open' THEN
   INSERT INTO citation_cases(ticket_id,assigned_to,reason) VALUES(p_data->>'ticketId',p_data->>'assignedTo',p_data->>'reason') RETURNING * INTO c;
  ELSE
   IF p_data->>'state'='resolved' AND length(trim(coalesce(p_data->>'decision','')))<3 THEN RAISE EXCEPTION 'A decision note is required'; END IF;
   UPDATE citation_cases SET state=coalesce(p_data->>'state',state),assigned_to=CASE WHEN p_data?'assignedTo' THEN p_data->>'assignedTo' ELSE assigned_to END,decision=coalesce(p_data->>'decision',decision),updated_at=now() WHERE id=(p_data->>'id')::uuid RETURNING * INTO c;
   IF c.id IS NULL THEN RAISE EXCEPTION 'Case not found'; END IF;
  END IF;
  RETURN to_jsonb(c);
 ELSIF p_action='settings' THEN
  IF u.role<>'admin' THEN RAISE EXCEPTION 'Only Admin can manage rules'; END IF;
  PERFORM pg_advisory_xact_lock(20261021);
  IF (p_data->>'baseVersion')::int IS DISTINCT FROM coalesce((SELECT max(version) FROM workflow_settings),1) THEN RAISE EXCEPTION 'Rules were updated by another administrator. Refresh before saving'; END IF;
  INSERT INTO workflow_settings(due_days,catalog,office_information,reason,created_by) VALUES((p_data->>'dueDays')::int,p_data->'catalog',coalesce(p_data->>'officeInformation',''),p_data->>'reason',u.id) RETURNING to_jsonb(workflow_settings.*) INTO result;
  RETURN result;
 ELSIF p_action IN ('followup.create','followup.done') THEN
  IF u.role NOT IN ('admin','treasury') THEN RAISE EXCEPTION 'Only Admin or Treasury can manage follow-up'; END IF;
  IF p_action='followup.create' THEN
   INSERT INTO followup_tasks(ticket_id,note,due_at,created_by) VALUES(p_data->>'ticketId',p_data->>'note',(p_data->>'dueAt')::timestamptz,u.id) RETURNING * INTO f;
  ELSE
   UPDATE followup_tasks SET status='done' WHERE id=(p_data->>'id')::uuid RETURNING * INTO f;
  END IF;
  RETURN to_jsonb(f);
 END IF;
 RAISE EXCEPTION 'Unknown workflow action';
END $$;

CREATE OR REPLACE FUNCTION public.workflow_settle(p_actor uuid,p_data jsonb,p_online boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE u users;t tickets;p payments;existing payments;s cashier_shifts; request_key text; receipt text;
BEGIN
 IF NOT p_online THEN
  SELECT * INTO u FROM users WHERE id=p_actor AND active AND role='treasury' FOR SHARE;
  IF u.id IS NULL THEN RAISE EXCEPTION 'Only active Treasury staff can collect payment'; END IF;
 END IF;
 SELECT * INTO t FROM tickets WHERE id=p_data->>'ticketId' FOR UPDATE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Citation not found'; END IF;
 request_key:=p_data->>'requestId'; receipt:=trim(p_data->>'orNumber');
 SELECT * INTO existing FROM payments WHERE ticket_id=t.id;
 IF existing.id IS NOT NULL THEN
  IF existing.request_id=request_key THEN
   IF p_online THEN
    UPDATE payment_exceptions SET status='resolved' WHERE ticket_id=t.id AND provider_reference=request_key AND status='open';
   END IF;
   RETURN to_jsonb(existing);
  END IF;
  IF p_online THEN
   INSERT INTO payment_exceptions(ticket_id,provider_reference,reason) VALUES(t.id,request_key,'Provider confirmed a payment for an already settled citation. Treasury review is required.') ON CONFLICT(provider_reference) DO NOTHING;
   RETURN jsonb_build_object('exception',true);
  END IF;
  RAISE EXCEPTION 'This citation already has a settlement. Open the original receipt';
 END IF;
 IF t.status IN ('Paid','Contested') THEN
  IF p_online THEN
   INSERT INTO payment_exceptions(ticket_id,provider_reference,reason) VALUES(t.id,request_key,'Provider confirmed payment but current citation status requires Treasury review.') ON CONFLICT(provider_reference) DO NOTHING;
   RETURN jsonb_build_object('exception',true);
  END IF;
  RAISE EXCEPTION 'This citation requires review before payment';
 END IF;
 IF t.total_fine<>(p_data->>'amount')::int OR t.total_fine<=0 THEN RAISE EXCEPTION 'Payment amount does not match citation'; END IF;
 IF length(coalesce(receipt,''))<1 OR length(coalesce(request_key,''))<1 THEN RAISE EXCEPTION 'Receipt and request identity are required'; END IF;
 IF NOT p_online THEN
  SELECT * INTO s FROM cashier_shifts WHERE cashier_id=u.id AND status='open' FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Open your cashier shift before collecting payment'; END IF;
 END IF;
 PERFORM set_config('citation.actor',coalesce(p_actor::text,''),true); PERFORM set_config('citation.actor_name',CASE WHEN p_online THEN 'PayMongo verification' ELSE u.name END,true); PERFORM set_config('citation.action','payment.settle',true);
 INSERT INTO payments(id,ticket_id,amount,channel,paid_at,received_by,or_number,received_by_id,shift_id,request_id)
 VALUES('PMT-'||gen_random_uuid()::text,t.id,t.total_fine,CASE WHEN p_online THEN 'Online (PayMongo)' ELSE 'Cash (Over-the-counter)' END,CASE WHEN p_online THEN (p_data->>'paidAt')::timestamptz ELSE now() END,CASE WHEN p_online THEN 'PayMongo Online Payment' ELSE u.name END,receipt,u.id,s.id,request_key) RETURNING * INTO p;
 UPDATE tickets SET status='Paid' WHERE id=t.id;
 IF p_online THEN
  UPDATE payment_exceptions SET status='resolved' WHERE ticket_id=t.id AND provider_reference=request_key AND status='open';
 END IF;
 RETURN to_jsonb(p);
END $$;
CREATE OR REPLACE FUNCTION public.workflow_user_status(p_actor uuid,p_user uuid,p_active boolean,p_reason text) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE result jsonb; BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role='admin' AND active) OR p_actor=p_user THEN RAISE EXCEPTION 'Cannot change this account status'; END IF;
 PERFORM set_config('citation.actor',p_actor::text,true); PERFORM set_config('citation.action','user.status',true); PERFORM set_config('citation.reason',p_reason,true);
 UPDATE users SET active=p_active,disabled_reason=p_reason,session_version=session_version+1 WHERE id=p_user RETURNING to_jsonb(users.*) INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.workflow_lookup_limit(p_key text) RETURNS boolean LANGUAGE plpgsql SET search_path=public AS $$
DECLARE n integer; BEGIN
 INSERT INTO public_lookup_limits(key,attempts) VALUES(p_key,1) ON CONFLICT(key) DO UPDATE SET
 attempts=CASE WHEN public_lookup_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE public_lookup_limits.attempts+1 END,
 window_start=CASE WHEN public_lookup_limits.window_start<now()-interval '15 minutes' THEN now() ELSE public_lookup_limits.window_start END RETURNING attempts INTO n;
 DELETE FROM public_lookup_limits WHERE window_start<now()-interval '1 day';
 RETURN n<=20;
END $$;
-- All workflow data and RPCs are server-only. Browser identities are custom signed sessions.
DO $$ DECLARE t text; fn record; pol record; BEGIN
 FOREACH t IN ARRAY ARRAY['users','tickets','payments','workflow_events','cashier_shifts','citation_cases','payment_attempts','payment_exceptions','workflow_settings','followup_tasks','public_lookup_limits'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
 FOR pol IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('users','tickets','payments') LOOP
  EXECUTE format('DROP POLICY %I ON public.%I',pol.policyname,pol.tablename);
 END LOOP;
 FOR fn IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'workflow_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn.sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn.sig);
 END LOOP;
END $$;
REVOKE ALL ON public.workflow_ticket_records FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.workflow_ticket_records TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.citation_number,public.workflow_settings_version_seq TO service_role;

CREATE OR REPLACE FUNCTION public.workflow_summary(p_owner uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
WITH r AS MATERIALIZED (SELECT * FROM workflow_ticket_records WHERE p_owner IS NULL OR issued_by_id=p_owner),
 d AS (SELECT (now() AT TIME ZONE 'Asia/Manila')::date AS today),
 v AS (SELECT value->>'label' AS name,count(*) AS count FROM r,jsonb_array_elements(r.violations) GROUP BY value->>'label' ORDER BY count DESC LIMIT 5),
 days AS (SELECT generate_series((SELECT today FROM d)-6,(SELECT today FROM d),'1 day'::interval)::date AS day),
 leaderboard AS (SELECT issued_by AS name,count(*) AS count FROM r WHERE (issued_at AT TIME ZONE 'Asia/Manila')::date=(SELECT today FROM d) GROUP BY issued_by ORDER BY count DESC LIMIT 3),
 methods AS (SELECT CASE WHEN channel LIKE 'Cash%' THEN 'Cash (OTC)' WHEN channel IN ('GCash','Maya') THEN channel ELSE 'Online / QRPh' END AS name,count(*) AS value FROM r WHERE payment IS NOT NULL GROUP BY 1)
SELECT jsonb_build_object('totalTickets',count(*),'todayCount',count(*) FILTER(WHERE (issued_at AT TIME ZONE 'Asia/Manila')::date=(SELECT today FROM d)),
 'yesterdayCount',count(*) FILTER(WHERE (issued_at AT TIME ZONE 'Asia/Manila')::date=(SELECT today-1 FROM d)),
 'paidCount',count(*) FILTER(WHERE status='Paid'),'unpaidCount',count(*) FILTER(WHERE status='Unpaid'),'pendingCount',count(*) FILTER(WHERE status<>'Paid'),
 'overdueAmount',coalesce(sum(total_fine) FILTER(WHERE status='Overdue'),0),'oldestOverdueDays',coalesce(max(ceil(extract(epoch FROM now()-due_date)/86400)) FILTER(WHERE status='Overdue'),0),
 'overdueCount',count(*) FILTER(WHERE status='Overdue'),'contestedCount',count(*) FILTER(WHERE status='Contested'),
 'flaggedCount',count(*) FILTER(WHERE endorsed_at IS NOT NULL AND status<>'Paid'),'flaggedAmount',coalesce(sum(total_fine) FILTER(WHERE endorsed_at IS NOT NULL AND status<>'Paid'),0),
 'unflaggedOverdueCount',count(*) FILTER(WHERE status='Overdue' AND endorsed_at IS NULL),
 'totalRevenue',coalesce(sum((payment->>'amount')::numeric),0),'pendingAmount',coalesce(sum(total_fine) FILTER(WHERE status<>'Paid'),0),
 'revenueToday',coalesce(sum((payment->>'amount')::numeric) FILTER(WHERE (paid_at AT TIME ZONE 'Asia/Manila')::date=(SELECT today FROM d)),0),
 'settledToday',count(*) FILTER(WHERE (paid_at AT TIME ZONE 'Asia/Manila')::date=(SELECT today FROM d)),
 'topViolations',coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM v),'[]'::jsonb),
 'leaderboard',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM leaderboard l),'[]'::jsonb),
 'paymentMethodData',coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM methods m),'[]'::jsonb),
 'recentTickets',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM r ORDER BY issued_at DESC,id DESC LIMIT 6)x),'[]'::jsonb),
 'recentTransactions',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM r WHERE payment IS NOT NULL ORDER BY paid_at DESC,id DESC LIMIT 6)x),'[]'::jsonb),
 'trendData',(SELECT jsonb_agg(jsonb_build_object('name',to_char(day,'Dy'),'issued',(SELECT count(*) FROM r WHERE (issued_at AT TIME ZONE 'Asia/Manila')::date=day),'paid',(SELECT count(*) FROM r WHERE (paid_at AT TIME ZONE 'Asia/Manila')::date=day)) ORDER BY day) FROM days)) FROM r
$$;
REVOKE ALL ON FUNCTION public.workflow_summary(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workflow_summary(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.workflow_history(p_license text,p_owner uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 WITH match AS MATERIALIZED (SELECT * FROM workflow_ticket_records WHERE (p_owner IS NULL OR issued_by_id=p_owner) AND length(regexp_replace(upper(p_license),'[^A-Z0-9]','','g'))>=6 AND regexp_replace(upper(p_license),'[^A-Z0-9]','','g') NOT IN ('UNKNOWN','NOLICENSE','NOTAPPLICABLE','UNLICENSED') AND regexp_replace(upper(license_no),'[^A-Z0-9]','','g')=regexp_replace(upper(p_license),'[^A-Z0-9]','','g'))
 SELECT jsonb_build_object('total',(SELECT count(*) FROM match),'tickets',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT * FROM match ORDER BY issued_at DESC,id DESC LIMIT 100)r),'[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION public.workflow_history(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workflow_history(text,uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.workflow_shifts(p_owner uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY opened_at DESC),'[]'::jsonb) FROM (
 SELECT s.id,s.cashier_id,s.cashier_name,s.opened_at,s.closed_at,s.opening_cash,s.counted_cash,s.difference,s.reason,s.status,
 CASE WHEN s.status='open' THEN coalesce((SELECT sum(amount) FROM payments WHERE shift_id=s.id AND channel='Cash (Over-the-counter)'),0) ELSE s.cash_collected END AS cash_collected,
 CASE WHEN s.status='open' THEN s.opening_cash+coalesce((SELECT sum(amount) FROM payments WHERE shift_id=s.id AND channel='Cash (Over-the-counter)'),0) ELSE s.expected_cash END AS expected_cash
 FROM cashier_shifts s WHERE p_owner IS NULL OR cashier_id=p_owner ORDER BY opened_at DESC LIMIT 50)r
$$;
CREATE OR REPLACE FUNCTION public.workflow_followups(p_state text DEFAULT 'open',p_page integer DEFAULT 1,p_size integer DEFAULT 25) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT jsonb_build_object('tasks',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM followup_tasks WHERE p_state='all' OR status=p_state ORDER BY (status='open') DESC,due_at,id LIMIT least(100,p_size) OFFSET (greatest(1,p_page)-1)*least(100,p_size))t),'[]'::jsonb),
 'total',count(*) FILTER(WHERE p_state='all' OR status=p_state),'openCount',count(*) FILTER(WHERE status='open'),'doneCount',count(*) FILTER(WHERE status='done'),'page',p_page,'pageSize',p_size) FROM followup_tasks
$$;
CREATE OR REPLACE FUNCTION public.workflow_exceptions(p_page integer DEFAULT 1,p_size integer DEFAULT 25) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 WITH e AS MATERIALIZED (
 SELECT id::text,ticket_id,provider_reference,reason,status,created_at FROM payment_exceptions WHERE status='open'
 UNION ALL SELECT 'attempt-'||ticket_id,ticket_id,link_id,coalesce(last_error,'Online checkout awaits provider confirmation.'),'open',created_at FROM payment_attempts a WHERE status<>'paid' AND NOT EXISTS(SELECT 1 FROM payment_exceptions x WHERE x.ticket_id=a.ticket_id AND x.status='open')
 UNION ALL SELECT 'review-'||id,id,NULL,'Citation status and settlement record need Treasury review.','open',issued_at FROM workflow_ticket_records WHERE (status='Paid' AND payment IS NULL) OR (status<>'Paid' AND payment IS NOT NULL))
 SELECT jsonb_build_object('exceptions',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM e ORDER BY created_at DESC,id LIMIT least(100,p_size) OFFSET (greatest(1,p_page)-1)*least(100,p_size))t),'[]'::jsonb),'total',(SELECT count(*) FROM e),'page',p_page,'pageSize',p_size)
$$;
REVOKE ALL ON FUNCTION public.workflow_shifts(uuid),public.workflow_followups(text,integer,integer),public.workflow_exceptions(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workflow_shifts(uuid),public.workflow_followups(text,integer,integer),public.workflow_exceptions(integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.workflow_lookup_allowed(p_key text) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public_lookup_limits WHERE key=p_key AND window_start>now()-interval '15 minutes' AND attempts>=20)
$$;
REVOKE ALL ON FUNCTION public.workflow_lookup_allowed(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workflow_lookup_allowed(text) TO service_role;
COMMIT;
