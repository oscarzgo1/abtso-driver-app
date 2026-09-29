import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Tachyo — Fleet Dispatch, Payroll & Compliance for UK Haulage",
    template: "%s — Tachyo",
  },
  description:
    "Tachyo puts live dispatch, walk-around checks, proof of delivery, fuel, payroll and margin on one screen — so UK haulage operators know which routes actually pay and can prove every delivery.",
  metadataBase: new URL("https://tachyo.co.uk"),
  openGraph: {
    title: "Tachyo — Fleet Dispatch, Payroll & Compliance for UK Haulage",
    description:
      "Live dispatch, walk-around checks, proof of delivery, fuel, payroll and margin on one screen.",
    url: "https://tachyo.co.uk",
    siteName: "Tachyo",
    images: [{ url: "/features/dashboard-screenshot.png", width: 2880, height: 1800, alt: "The Tachyo admin dashboard" }],
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tachyo — Fleet Dispatch, Payroll & Compliance for UK Haulage",
    description:
      "Live dispatch, walk-around checks, proof of delivery, fuel, payroll and margin on one screen.",
    images: ["/features/dashboard-screenshot.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg text-charcoal">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
