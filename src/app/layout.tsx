import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { getSetting, SETTING_KEYS } from "@/lib/settings";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EasySSL - Free Let's Encrypt SSL Certificates",
  description: "Generate and auto-renew free SSL certificates from Let's Encrypt",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = await getSetting(SETTING_KEYS.GA_MEASUREMENT_ID);

  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          {/* Paddle.js — loaded in head per Paddle docs */}
          <Script
            src="https://cdn.paddle.com/paddle/v2/paddle.js"
            strategy="beforeInteractive"
          />
        </head>
        <body className={inter.className}>
          {children}
          <Analytics />
          <SpeedInsights />
          {gaId && (
            <>
              <Script
                src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
                strategy="afterInteractive"
              />
              <Script id="google-analytics" strategy="afterInteractive">
                {`
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments)}
                  gtag('js', new Date());
                  gtag('config', '${gaId}');
                `}
              </Script>
            </>
          )}
        </body>
      </html>
    </ClerkProvider>
  );
}
