-- =====================================================================
-- Task #10 - Company pulse + onboarding data-quality
--   1. get_company_pulse(p_company_id) : score 0-100 + métricas
--   2. get_company_data_quality(p_company_id) : checklist de cadastros
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_company_pulse(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.is_super_admin();
  v_company uuid := COALESCE(p_company_id, (
    SELECT company_id FROM public.company_users
     WHERE user_id = v_user AND is_active = TRUE
     ORDER BY created_at DESC NULLS LAST LIMIT 1
  ));
  v_sales_7 numeric := 0;
  v_sales_14_prev numeric := 0;  -- dias 8..14 atrás
  v_sales_count_7 int := 0;
  v_low_stock int := 0;
  v_out_stock int := 0;
  v_active_clients int := 0;
  v_fiado_total numeric := 0;
  v_fiado_count int := 0;
  v_rejection_rate numeric := 0;
  v_nfe_total int := 0;
  v_cert_status text := 'unknown';
  v_score int := 0;
  v_signals jsonb := '[]'::jsonb;
  v_cert_expires timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;

  IF v_company IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_company');
  END IF;

  IF NOT v_is_admin AND NOT public.user_belongs_to_company(v_company) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  -- Vendas últimos 7 dias vs. 7 dias anteriores
  BEGIN
    SELECT COALESCE(SUM(total), 0), COUNT(*)
      INTO v_sales_7, v_sales_count_7
      FROM public.sales
     WHERE company_id = v_company
       AND created_at >= NOW() - interval '7 days'
       AND COALESCE(status, 'finalizada') NOT IN ('cancelada', 'cancelled');

    SELECT COALESCE(SUM(total), 0)
      INTO v_sales_14_prev
      FROM public.sales
     WHERE company_id = v_company
       AND created_at >= NOW() - interval '14 days'
       AND created_at <  NOW() - interval '7 days'
       AND COALESCE(status, 'finalizada') NOT IN ('cancelada', 'cancelled');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Estoque
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE stock_quantity <= 0),
      COUNT(*) FILTER (WHERE stock_quantity > 0 AND min_stock IS NOT NULL AND stock_quantity <= min_stock)
    INTO v_out_stock, v_low_stock
    FROM public.products
    WHERE company_id = v_company
      AND (active IS NULL OR active = TRUE);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Clientes + fiado
  BEGIN
    SELECT COUNT(*) INTO v_active_clients
      FROM public.clients
     WHERE company_id = v_company;

    SELECT COALESCE(SUM(credit_balance), 0), COUNT(*) FILTER (WHERE credit_balance > 0)
      INTO v_fiado_total, v_fiado_count
      FROM public.clients
     WHERE company_id = v_company;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Fiscal: rejeição últimos 30d
  BEGIN
    SELECT
      COUNT(*),
      CASE WHEN COUNT(*) = 0 THEN 0
           ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'rejeitada') / COUNT(*), 2)
      END
    INTO v_nfe_total, v_rejection_rate
    FROM public.nfe_documents
    WHERE company_id = v_company
      AND created_at >= NOW() - interval '30 days';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Certificado
  BEGIN
    SELECT COALESCE(certificate_expires_at, certificate_expiry)
      INTO v_cert_expires
      FROM public.fiscal_configs
     WHERE company_id = v_company AND is_active = TRUE
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1;

    v_cert_status := CASE
      WHEN v_cert_expires IS NULL THEN 'missing'
      WHEN v_cert_expires < NOW() THEN 'expired'
      WHEN v_cert_expires < NOW() + interval '7 days' THEN 'critical'
      WHEN v_cert_expires < NOW() + interval '30 days' THEN 'warning'
      ELSE 'ok'
    END;
  EXCEPTION WHEN OTHERS THEN
    v_cert_status := 'unknown';
  END;

  -- ═══ Score (0-100) ═══
  v_score := 100;

  -- Penalidades
  IF v_sales_7 = 0 THEN
    v_score := v_score - 25;
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'severity', 'high',
      'key', 'no_sales_7d',
      'message', 'Nenhuma venda registrada nos últimos 7 dias'
    ));
  ELSIF v_sales_14_prev > 0 AND v_sales_7 < v_sales_14_prev * 0.5 THEN
    v_score := v_score - 10;
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'severity', 'medium',
      'key', 'sales_drop',
      'message', 'Vendas caíram mais de 50% vs. semana anterior'
    ));
  END IF;

  IF v_cert_status = 'expired' THEN
    v_score := v_score - 30;
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'severity', 'high',
      'key', 'cert_expired',
      'message', 'Certificado digital vencido — emissão bloqueada'
    ));
  ELSIF v_cert_status = 'critical' THEN
    v_score := v_score - 15;
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'severity', 'high',
      'key', 'cert_critical',
      'message', 'Certificado digital vence em menos de 7 dias'
    ));
  ELSIF v_cert_status = 'warning' THEN
    v_score := v_score - 5;
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'severity', 'medium',
      'key', 'cert_warning',
      'message', 'Certificado digital vence em até 30 dias'
    ));
  ELSIF v_cert_status = 'missing' THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'severity', 'low',
      'key', 'cert_missing',
      'message', 'Certificado digital não cadastrado'
    ));
  END IF;

  IF v_rejection_rate > 10 THEN
    v_score := v_score - 15;
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'severity', 'high',
      'key', 'high_rejection',
      'message', 'Taxa de rejeição fiscal acima de 10%'
    ));
  ELSIF v_rejection_rate > 5 THEN
    v_score := v_score - 8;
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'severity', 'medium',
      'key', 'elevated_rejection',
      'message', 'Taxa de rejeição fiscal acima de 5%'
    ));
  END IF;

  IF v_out_stock > 0 THEN
    v_score := v_score - LEAST(10, v_out_stock);
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'severity', 'medium',
      'key', 'out_of_stock',
      'message', format('%s produto(s) zerado(s) no estoque', v_out_stock)
    ));
  END IF;

  IF v_fiado_total > 0 THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'severity', 'info',
      'key', 'fiado_open',
      'message', format('Fiado em aberto: R$ %s (%s cliente[s])',
        to_char(v_fiado_total, 'FM999G999G999D00'),
        v_fiado_count)
    ));
  END IF;

  v_score := GREATEST(v_score, 0);

  RETURN jsonb_build_object(
    'ok', TRUE,
    'company_id', v_company,
    'score', v_score,
    'tier', CASE
      WHEN v_score >= 85 THEN 'excelente'
      WHEN v_score >= 70 THEN 'bom'
      WHEN v_score >= 50 THEN 'atencao'
      ELSE 'critico'
    END,
    'metrics', jsonb_build_object(
      'sales_7d',        v_sales_7,
      'sales_7d_prev',   v_sales_14_prev,
      'sales_count_7d',  v_sales_count_7,
      'sales_delta_pct',
        CASE WHEN v_sales_14_prev = 0 THEN NULL
             ELSE ROUND(100.0 * (v_sales_7 - v_sales_14_prev) / v_sales_14_prev, 2)
        END,
      'low_stock',       v_low_stock,
      'out_of_stock',    v_out_stock,
      'active_clients',  v_active_clients,
      'fiado_total',     v_fiado_total,
      'fiado_count',     v_fiado_count,
      'nfe_total_30d',   v_nfe_total,
      'rejection_rate',  v_rejection_rate,
      'cert_status',     v_cert_status,
      'cert_expires_at', v_cert_expires
    ),
    'signals', v_signals
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_pulse(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. get_company_data_quality(p_company_id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_company_data_quality(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.is_super_admin();
  v_company uuid := COALESCE(p_company_id, (
    SELECT company_id FROM public.company_users
     WHERE user_id = v_user AND is_active = TRUE
     ORDER BY created_at DESC NULLS LAST LIMIT 1
  ));
  v_row public.companies%ROWTYPE;
  v_items jsonb := '[]'::jsonb;
  v_total int := 0;
  v_ok int := 0;
  v_products_no_ncm int := 0;
  v_products_no_price int := 0;
  v_clients_no_doc int := 0;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'unauthenticated');
  END IF;

  IF v_company IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_company');
  END IF;

  IF NOT v_is_admin AND NOT public.user_belongs_to_company(v_company) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  SELECT * INTO v_row FROM public.companies WHERE id = v_company;

  -- Checks (each is {label, passed, severity, fix_route})
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'cnpj',     'label', 'CNPJ cadastrado',
    'passed', v_row.cnpj IS NOT NULL AND length(regexp_replace(v_row.cnpj, '\D', '', 'g')) = 14,
    'severity', 'high', 'fix_route', '/configuracoes'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'ie',       'label', 'Inscrição Estadual',
    'passed', v_row.ie IS NOT NULL AND length(v_row.ie) >= 4,
    'severity', 'medium', 'fix_route', '/configuracoes'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'endereco', 'label', 'Endereço completo (logradouro + cidade + UF)',
    'passed', v_row.address_street IS NOT NULL AND v_row.address_city IS NOT NULL AND v_row.address_state IS NOT NULL,
    'severity', 'high', 'fix_route', '/configuracoes'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'telefone', 'label', 'Telefone de contato',
    'passed', v_row.phone IS NOT NULL AND length(regexp_replace(v_row.phone, '\D', '', 'g')) >= 10,
    'severity', 'low', 'fix_route', '/configuracoes'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'logo',     'label', 'Logo da empresa',
    'passed', v_row.logo_url IS NOT NULL,
    'severity', 'low', 'fix_route', '/configuracoes'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'crt',      'label', 'Regime tributário (CRT)',
    'passed', v_row.crt IS NOT NULL,
    'severity', 'high', 'fix_route', '/configuracoes'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'pix',      'label', 'Chave PIX cadastrada',
    'passed', v_row.pix_key IS NOT NULL,
    'severity', 'low', 'fix_route', '/configuracoes'
  ));

  -- Produtos sem NCM / sem preço
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE ncm IS NULL OR length(regexp_replace(ncm, '\D', '', 'g')) <> 8),
      COUNT(*) FILTER (WHERE sale_price IS NULL OR sale_price <= 0)
    INTO v_products_no_ncm, v_products_no_price
    FROM public.products
    WHERE company_id = v_company
      AND (active IS NULL OR active = TRUE);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'products_ncm',  'label', 'Todos os produtos têm NCM válido',
    'passed', v_products_no_ncm = 0,
    'detail', CASE WHEN v_products_no_ncm > 0 THEN format('%s produto(s) sem NCM', v_products_no_ncm) ELSE NULL END,
    'severity', 'high', 'fix_route', '/produtos'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'products_price', 'label', 'Todos os produtos têm preço',
    'passed', v_products_no_price = 0,
    'detail', CASE WHEN v_products_no_price > 0 THEN format('%s produto(s) sem preço', v_products_no_price) ELSE NULL END,
    'severity', 'medium', 'fix_route', '/produtos'
  ));

  -- Clientes sem documento (apenas se houver clientes)
  BEGIN
    SELECT COUNT(*) FILTER (WHERE (document IS NULL OR document = '') AND (cpf_cnpj IS NULL OR cpf_cnpj = ''))
      INTO v_clients_no_doc
      FROM public.clients
     WHERE company_id = v_company;
  EXCEPTION WHEN OTHERS THEN
    v_clients_no_doc := 0;
  END;

  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'clients_doc', 'label', 'Clientes cadastrados com CPF/CNPJ',
    'passed', v_clients_no_doc = 0,
    'detail', CASE WHEN v_clients_no_doc > 0 THEN format('%s cliente(s) sem documento', v_clients_no_doc) ELSE NULL END,
    'severity', 'low', 'fix_route', '/clientes'
  ));

  -- Compute completeness
  SELECT COUNT(*), COUNT(*) FILTER (WHERE (item->>'passed')::boolean)
    INTO v_total, v_ok
    FROM jsonb_array_elements(v_items) AS item;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'company_id', v_company,
    'total', v_total,
    'passed', v_ok,
    'score', CASE WHEN v_total = 0 THEN 0 ELSE ROUND(100.0 * v_ok / v_total) END,
    'items', v_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_data_quality(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_company_pulse(uuid) IS
  'Retorna score 0-100 + métricas (vendas, estoque, fiscal, fiado) e sinais de atenção para a empresa.';
COMMENT ON FUNCTION public.get_company_data_quality(uuid) IS
  'Checklist de qualidade de cadastros (CNPJ, endereço, produtos sem NCM etc.).';
