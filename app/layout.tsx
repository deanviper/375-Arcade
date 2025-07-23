import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import WalletConnectProvider from "../components/WalletConnectProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "375 Arcade",
  description: "Built for the community of 375ai and IRYS",
  openGraph: {
    title: "375 Arcade - Retro Games on Blockchain",
    description: "Play classic Tetris and Pacman games with blockchain leaderboards. Built for the 375ai and IRYS community.",
    url: "https://375-arcade.vercel.app",
    siteName: "375 Arcade",
    images: [
      {
        url: "/arcade-title.png",
        width: 800,
        height: 400,
        alt: "375 Arcade - Built on Irys",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "375 Arcade - Retro Games on Blockchain",
    description: "Play classic Tetris and Pacman games with blockchain leaderboards. Built for the 375ai and IRYS community.",
    images: ["/arcade-title.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <WalletConnectProvider>
          {children}
        </WalletConnectProvider>
      </body>
    </html>
  );
}
