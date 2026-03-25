import { Helmet } from "react-helmet-async";

interface SEOHeadProps {
  title?: string;
  description?: string;
  path?: string;
  type?: "website" | "article" | "product";
  image?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
}

const SITE = "https://anthosystem.com.br";
const DEFAULT_IMAGE = `${SITE}/marketing/og-banner-1200x630.png`;
const SITE_NAME = "AnthoSystem";

export function SEOHead({
  title,
  description = "Sistema de gestão completo para comércios e varejo. PDV, estoque, fiscal e financeiro integrados.",
  path = "/",
  type = "website",
  image = DEFAULT_IMAGE,
  noindex = false,
  jsonLd,
}: SEOHeadProps) {
  const fullTitle = title
    ? `${title} | ${SITE_NAME}`
    : "Sistema para Comércio e Varejo | AnthoSystem — PDV, Estoque e Fiscal";
  const url = `${SITE}${path}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="pt_BR" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* JSON-LD */}
      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}
