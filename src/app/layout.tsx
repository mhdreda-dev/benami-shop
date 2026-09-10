import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ben Ami Shop",
    template: "%s | Ben Ami Shop",
  },
  description:
    "Découvrez une sélection de vêtements et chaussures chez Ben Ami Shop.",
  applicationName: "Ben Ami Shop",
  openGraph: {
    type: "website",
    locale: "fr_MA",
    siteName: "Ben Ami Shop",
    title: "Ben Ami Shop",
    description: "Mode, vêtements et chaussures sélectionnés avec soin.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ben Ami Shop",
    description: "Mode, vêtements et chaussures sélectionnés avec soin.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf9f7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={GeistSans.variable}>
      <body>
        <a className="skip-link" href="#main-content">
          Aller au contenu
        </a>
        {children}
      </body>
    </html>
  );
}
