'use client';

import Script from 'next/script';

// Add your real IDs here
const YANDEX_METRIKA_ID = 'YOUR_YANDEX_METRIKA_ID'; 
const GOOGLE_ANALYTICS_ID = 'YOUR_GOOGLE_ANALYTICS_ID';

export function Analytics() {
  return (
    <>
      {/* Yandex Metrika */}
      {YANDEX_METRIKA_ID !== 'YOUR_YANDEX_METRIKA_ID' && (
        <Script id="yandex-metrika" strategy="afterInteractive">
          {`
            (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
            (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

            ym(${YANDEX_METRIKA_ID}, "init", {
                 clickmap:true,
                 trackLinks:true,
                 accurateTrackBounce:true,
                 webvisor:true
            });
          `}
        </Script>
      )}

      {/* Google Analytics */}
      {GOOGLE_ANALYTICS_ID !== 'YOUR_GOOGLE_ANALYTICS_ID' && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GOOGLE_ANALYTICS_ID}');
            `}
          </Script>
        </>
      )}
    </>
  );
}
