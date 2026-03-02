import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { year, month, company_id } = body;

    if (!year || !month) {
      return new Response(JSON.stringify({ error: "Ano e mês são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get company_id from body or from user's company
    let companyId = company_id;
    if (!companyId) {
      const { data: cu } = await adminClient
        .from("company_users")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      companyId = cu?.company_id;
    }

    if (!companyId) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user belongs to company
    const { data: membership } = await adminClient
      .from("company_users")
      .select("id")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Acesso negado a esta empresa" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load company data
    const { data: company } = await adminClient
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = adminClient;

    // Load fiscal documents for the period
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    const { data: docs } = await supabase
      .from("fiscal_documents")
      .select("*")
      .eq("company_id", companyId)
      .gte("created_at", startDate)
      .lt("created_at", endDate)
      .order("created_at", { ascending: true });

    const fiscalDocs = docs || [];
    const period = `${String(month).padStart(2, "0")}/${year}`;

    // Generate SPED EFD ICMS/IPI text file
    const lines: string[] = [];
    const cnpj = company.cnpj?.replace(/\D/g, "") || "";
    const ie = company.state_registration?.replace(/\D/g, "") || "";
    const uf = company.address_state || "";
    const codMun = company.address_city_code || "";
    const dtIni = `01${String(month).padStart(2, "0")}${year}`;
    const lastDay = new Date(year, month, 0).getDate();
    const dtFin = `${lastDay}${String(month).padStart(2, "0")}${year}`;

    // Block 0 - Opening
    lines.push(`|0000|017|0|${dtIni}|${dtFin}|${company.name || ""}|${cnpj}|${uf}|${ie}|||${codMun}|||A|1|`);
    lines.push(`|0001|0|`);
    lines.push(`|0005|${company.trade_name || company.name || ""}|${company.address_zip?.replace(/\D/g, "") || ""}|${company.address_street || ""}|${company.address_number || ""}|${company.address_complement || ""}|${company.address_neighborhood || ""}||||`);
    lines.push(`|0100|||||||||||||||||`); // Contador placeholder

    // Block 0 - Products
    const productSet = new Set<string>();
    fiscalDocs.forEach((doc: any) => {
      try {
        const xml = doc.xml_content;
        if (!xml) return;
        // Extract products from items if available
      } catch {}
    });

    lines.push(`|0990|${lines.length + 1}|`);

    // Block C - Fiscal Documents
    lines.push(`|C001|${fiscalDocs.length > 0 ? "0" : "1"}|`);

    let cLineCount = 2;
    fiscalDocs.forEach((doc: any) => {
      const docDate = new Date(doc.created_at);
      const dtDoc = `${String(docDate.getDate()).padStart(2, "0")}${String(docDate.getMonth() + 1).padStart(2, "0")}${docDate.getFullYear()}`;
      const chave = doc.access_key || "";
      const numDoc = String(doc.number || 0).padStart(9, "0");
      const serie = String(doc.serie || 1).padStart(3, "0");
      const valor = (doc.total_value || 0).toFixed(2).replace(".", ",");

      if (doc.doc_type === "nfce") {
        lines.push(`|C100|1|0||65|00|${serie}|${numDoc}|${chave}|${dtDoc}|${dtDoc}|${valor}|0|0,00|${valor}|0|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|`);
        cLineCount++;
      } else if (doc.doc_type === "nfe") {
        lines.push(`|C100|0|0||55|00|${serie}|${numDoc}|${chave}|${dtDoc}|${dtDoc}|${valor}|0|0,00|${valor}|0|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|`);
        cLineCount++;
      }
    });

    lines.push(`|C990|${cLineCount}|`);

    // Blocks D, E, G, H, K, 1, 9 - minimal
    lines.push(`|D001|1|`);
    lines.push(`|D990|2|`);
    lines.push(`|E001|1|`);
    lines.push(`|E990|2|`);
    lines.push(`|G001|1|`);
    lines.push(`|G990|2|`);
    lines.push(`|H001|1|`);
    lines.push(`|H990|2|`);
    lines.push(`|K001|1|`);
    lines.push(`|K990|2|`);
    lines.push(`|1001|1|`);
    lines.push(`|1990|2|`);

    // Block 9 - Totals
    const totalLines = lines.length + 3;
    lines.push(`|9001|0|`);
    lines.push(`|9900|9999|1|`);
    lines.push(`|9990|${totalLines}|`);
    lines.push(`|9999|${totalLines + 1}|`);

    const spedContent = lines.join("\n");

    // Upload to storage
    const filePath = `sped/${companyId}/${year}_${String(month).padStart(2, "0")}_SPED.txt`;
    const encoder = new TextEncoder();
    const fileBytes = encoder.encode(spedContent);

    const { error: uploadErr } = await supabase.storage
      .from("company-backups")
      .upload(filePath, fileBytes, {
        contentType: "text/plain",
        upsert: true,
      });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        period,
        docs_count: fiscalDocs.length,
        file_path: filePath,
        lines_count: lines.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("generate-sped error:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
