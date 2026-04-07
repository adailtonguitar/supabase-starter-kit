import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { company_id, clients } = await req.json();
    if (!company_id || !Array.isArray(clients) || clients.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "company_id and clients[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get existing clients for dedup
    const { data: existing } = await supabase
      .from("clients")
      .select("name, document")
      .eq("company_id", company_id);

    const existingDocs = new Set((existing || []).filter(e => e.document).map(e => e.document));
    const existingNames = new Set((existing || []).map(e => e.name?.toUpperCase()));

    const toInsert = clients.filter((c: any) => {
      if (c.document && existingDocs.has(c.document)) return false;
      if (existingNames.has(c.name?.toUpperCase())) return false;
      return true;
    }).map((c: any) => ({
      company_id,
      name: c.name,
      document: c.document || null,
      document_type: c.document_type || null,
      phone: c.phone || null,
      email: c.email || null,
      address: c.address || null,
      city: c.city || null,
      state: c.state || null,
      zip_code: c.zip_code || null,
    }));

    if (toInsert.length === 0) {
      return new Response(JSON.stringify({ success: true, inserted: 0, skipped: clients.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert in batches of 50
    let inserted = 0;
    let errors = 0;
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await supabase.from("clients").insert(batch);
      if (error) {
        console.error("Batch insert error:", error);
        errors += batch.length;
      } else {
        inserted += batch.length;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      inserted,
      skipped: clients.length - toInsert.length,
      errors,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
