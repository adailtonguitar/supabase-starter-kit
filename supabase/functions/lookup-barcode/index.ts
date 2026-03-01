const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { barcode } = await req.json();

    if (!barcode || barcode.length < 8) {
      return new Response(JSON.stringify({ found: false, error: "Código de barras inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[lookup-barcode] Buscando EAN: ${barcode}`);

    // Try Open Food Facts first
    const offUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,categories_tags_pt,quantity,code`;
    
    const offResp = await fetch(offUrl, {
      headers: { "User-Agent": "ANTHOSYSTEM/1.0 (contact@anthosystem.com)" },
    });

    if (offResp.ok) {
      const offData = await offResp.json();
      
      if (offData.status === 1 && offData.product) {
        const p = offData.product;
        const name = [p.brands, p.product_name].filter(Boolean).join(" - ") || p.product_name || "";
        
        // Map OFF categories to our categories
        const categoryMap: Record<string, string> = {
          "beverages": "Bebidas",
          "drinks": "Bebidas",
          "dairies": "Frios",
          "meats": "Frios",
          "snacks": "Alimentos",
          "cereals": "Alimentos",
          "breads": "Padaria",
          "cleaning": "Limpeza",
          "hygiene": "Higiene",
        };
        
        let category = "";
        if (p.categories_tags_pt?.length) {
          for (const tag of p.categories_tags_pt) {
            const key = tag.replace("en:", "").replace("pt:", "").toLowerCase();
            for (const [match, cat] of Object.entries(categoryMap)) {
              if (key.includes(match)) {
                category = cat;
                break;
              }
            }
            if (category) break;
          }
        }

        // Detect unit from quantity field
        let unit = "UN";
        const qty = (p.quantity || "").toLowerCase();
        if (qty.includes("kg") || qty.includes("quilo")) unit = "KG";
        else if (qty.includes("l") || qty.includes("ml") || qty.includes("litro")) unit = "LT";

        console.log(`[lookup-barcode] Encontrado via Open Food Facts: ${name}`);

        return new Response(JSON.stringify({
          found: true,
          source: "openfoodfacts",
          product: {
            name: name.substring(0, 200),
            category,
            unit,
            barcode,
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log(`[lookup-barcode] Produto não encontrado para EAN: ${barcode}`);

    return new Response(JSON.stringify({ found: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[lookup-barcode] Error:", err?.message);
    return new Response(JSON.stringify({ found: false, error: err?.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
