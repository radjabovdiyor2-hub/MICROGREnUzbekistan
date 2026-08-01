// Микроразметка schema.org для главной: организация, магазин, товары,
// частые вопросы. Вынесена из layout.tsx.

import { jsonLdScript } from '@/lib/seo/jsonLd';
import { HOME_JSON_LD_DATA } from '@/lib/seo/homeJsonLdData';

export function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdScript(HOME_JSON_LD_DATA) }}
    />
  );
}
