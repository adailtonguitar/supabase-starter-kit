-- =====================================================
-- Furniture Mode: Full Schema Migration
-- Tables for all 10 differentiating features
-- =====================================================

-- 1. Before & After Gallery
CREATE TABLE IF NOT EXISTS public.furniture_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  room TEXT NOT NULL,
  description TEXT DEFAULT '',
  before_url TEXT DEFAULT '',
  after_url TEXT DEFAULT '',
  rating INTEGER DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.furniture_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "furniture_projects_company" ON public.furniture_projects
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- 2. Room Measurements
CREATE TABLE IF NOT EXISTS public.room_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  room TEXT NOT NULL,
  notes TEXT DEFAULT '',
  walls JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.room_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_measurements_company" ON public.room_measurements
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- 3. Technical Assistance Tickets
CREATE TABLE IF NOT EXISTS public.technical_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  product TEXT NOT NULL,
  issue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_andamento','aguardando_peca','concluido')),
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa','media','alta','urgente')),
  sla_deadline DATE,
  notes JSONB DEFAULT '[]'::jsonb,
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.technical_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "technical_tickets_company" ON public.technical_tickets
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- 4. Credit System (Crediário)
CREATE TABLE IF NOT EXISTS public.credit_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id),
  name TEXT NOT NULL,
  cpf TEXT,
  phone TEXT,
  score INTEGER DEFAULT 500 CHECK (score >= 0 AND score <= 1000),
  credit_limit NUMERIC(12,2) DEFAULT 0,
  credit_used NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo','bloqueado','inadimplente')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credit_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_clients_company" ON public.credit_clients
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.credit_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_client_id UUID NOT NULL REFERENCES public.credit_clients(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id TEXT,
  installment_number TEXT NOT NULL,
  value NUMERIC(12,2) NOT NULL,
  due_date DATE NOT NULL,
  paid BOOLEAN DEFAULT false,
  paid_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credit_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_installments_company" ON public.credit_installments
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- 5. Room Plans (Montador de Ambientes)
CREATE TABLE IF NOT EXISTS public.room_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Novo Ambiente',
  items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.room_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_plans_company" ON public.room_plans
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- 6. Delivery Tracking
CREATE TABLE IF NOT EXISTS public.delivery_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id TEXT,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  address TEXT NOT NULL,
  driver_name TEXT,
  driver_phone TEXT,
  status TEXT DEFAULT 'em_separacao' CHECK (status IN ('em_separacao','em_rota','proximo','entregue')),
  eta TEXT,
  timeline JSONB DEFAULT '[]'::jsonb,
  tracking_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_tracking_company" ON public.delivery_tracking
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- 7. Storage bucket for furniture photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('furniture-photos', 'furniture-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "furniture_photos_select" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'furniture-photos');

CREATE POLICY "furniture_photos_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'furniture-photos');

CREATE POLICY "furniture_photos_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'furniture-photos');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_furniture_projects_company ON public.furniture_projects(company_id);
CREATE INDEX IF NOT EXISTS idx_room_measurements_company ON public.room_measurements(company_id);
CREATE INDEX IF NOT EXISTS idx_technical_tickets_company ON public.technical_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_technical_tickets_status ON public.technical_tickets(company_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_clients_company ON public.credit_clients(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_installments_client ON public.credit_installments(credit_client_id);
CREATE INDEX IF NOT EXISTS idx_credit_installments_due ON public.credit_installments(company_id, due_date) WHERE NOT paid;
CREATE INDEX IF NOT EXISTS idx_room_plans_company ON public.room_plans(company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_tracking_company ON public.delivery_tracking(company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_tracking_status ON public.delivery_tracking(company_id, status);
