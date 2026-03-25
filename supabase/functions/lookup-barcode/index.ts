const ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
  "https://id-preview--d4ab3861-f98c-4c08-a556-30aa884845a3.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const categoryMap: Record<string, string> = {
  beverages: "Bebidas", drinks: "Bebidas", bebidas: "Bebidas",
  dairies: "Frios", meats: "Frios", frios: "Frios", laticínios: "Frios",
  snacks: "Alimentos", cereals: "Alimentos", alimentos: "Alimentos", food: "Alimentos",
  breads: "Padaria", padaria: "Padaria", bakery: "Padaria",
  cleaning: "Limpeza", limpeza: "Limpeza",
  hygiene: "Higiene", higiene: "Higiene", beauty: "Higiene",
  fruits: "Hortifrúti", vegetables: "Hortifrúti", hortifrúti: "Hortifrúti",
};

function mapCategory(tags: string[]): string {
  for (const tag of tags) {
    const key = tag.replace(/^(en|pt|pt-br):/, "").toLowerCase();
    for (const [match, cat] of Object.entries(categoryMap)) {
      if (key.includes(match)) return cat;
    }
  }
  return "";
}

function detectUnit(quantity: string): string {
  const q = (quantity || "").toLowerCase();
  if (q.includes("kg") || q.includes("quilo")) return "KG";
  if (q.includes("l") || q.includes("ml") || q.includes("litro")) return "LT";
  if (q.includes("mt") || q.includes("metro")) return "MT";
  return "UN";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // JWT validation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ found: false, error: "Não autorizado" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ found: false, error: "Token inválido" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { barcode, company_id } = await req.json();

    if (!barcode || barcode.length < 8) {
      return new Response(JSON.stringify({ found: false, error: "Código de barras inválido" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Rate limiting: máx 30 buscas por minuto por empresa
    if (company_id) {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: allowed } = await sb.rpc("check_rate_limit", {
        p_company_id: company_id,
        p_fn_name: "lookup-barcode",
        p_max_calls: 30,
        p_window_sec: 60,
      });
      if (allowed === false) {
        return new Response(JSON.stringify({ found: false, error: "Limite de buscas excedido. Aguarde." }), {
          status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    console.log(`[lookup-barcode] Buscando EAN: ${barcode}`);

    // 1) Try Open Food Facts
    try {
      const offUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,categories_tags_pt,quantity,code`;
      const offResp = await fetch(offUrl, {
        headers: { "User-Agent": "ANTHOSYSTEM/1.0 (contact@anthosystem.com)" },
        signal: AbortSignal.timeout(5000),
      });

      if (offResp.ok) {
        const offData = await offResp.json();
        if (offData.status === 1 && offData.product?.product_name) {
          const p = offData.product;
          const name = [p.brands, p.product_name].filter(Boolean).join(" - ");
          const category = mapCategory(p.categories_tags_pt || []);
          const unit = detectUnit(p.quantity || "");
          console.log(`[lookup-barcode] Found via Open Food Facts: ${name}`);
          return new Response(JSON.stringify({
            found: true, source: "openfoodfacts",
            product: { name: name.substring(0, 200), category, unit, barcode },
          }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
        }
      }
    } catch (e) {
      console.warn("[lookup-barcode] OFF error:", e);
    }

    // 2) Try Cosmos (Brazilian product database)
    try {
      const cosmosUrl = `https://api.cosmos.bluesoft.com.br/gtins/${barcode}`;
      const cosmosKey = Deno.env.get("COSMOS_API_KEY");
      
      if (cosmosKey) {
        const cosmosResp = await fetch(cosmosUrl, {
          headers: {
            "X-Cosmos-Token": cosmosKey,
            "User-Agent": "ANTHOSYSTEM/1.0",
          },
          signal: AbortSignal.timeout(5000),
        });

        if (cosmosResp.ok) {
          const cosmosData = await cosmosResp.json();
          if (cosmosData.description) {
            const name = cosmosData.description || "";
            const brand = cosmosData.brand?.name || "";
            const fullName = brand ? `${brand} - ${name}` : name;
            const ncm = cosmosData.ncm?.code || "";
            const unit = cosmosData.gross_weight ? "KG" : "UN";
            
            console.log(`[lookup-barcode] Found via Cosmos: ${fullName}`);
            return new Response(JSON.stringify({
              found: true, source: "cosmos",
              product: {
                name: fullName.substring(0, 200),
                category: "",
                unit,
                barcode,
                ncm,
                brand: brand,
              },
            }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
          }
        } else {
          await cosmosResp.text(); // consume body
        }
      }
    } catch (e) {
      console.warn("[lookup-barcode] Cosmos error:", e);
    }

    // 3) Try Open Beauty Facts (cosmetics/hygiene)
    try {
      const obfUrl = `https://world.openbeautyfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,quantity`;
      const obfResp = await fetch(obfUrl, {
        headers: { "User-Agent": "ANTHOSYSTEM/1.0" },
        signal: AbortSignal.timeout(4000),
      });

      if (obfResp.ok) {
        const obfData = await obfResp.json();
        if (obfData.status === 1 && obfData.product?.product_name) {
          const p = obfData.product;
          const name = [p.brands, p.product_name].filter(Boolean).join(" - ");
          console.log(`[lookup-barcode] Found via Open Beauty Facts: ${name}`);
          return new Response(JSON.stringify({
            found: true, source: "openbeautyfacts",
            product: { name: name.substring(0, 200), category: "Higiene", unit: "UN", barcode },
          }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
        }
      }
    } catch (e) {
      console.warn("[lookup-barcode] OBF error:", e);
    }

    console.log(`[lookup-barcode] Produto não encontrado para EAN: ${barcode}`);
    return new Response(JSON.stringify({ found: false }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[lookup-barcode] Error:", err?.message);
    return new Response(JSON.stringify({ found: false, error: err?.message || "Erro interno" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
