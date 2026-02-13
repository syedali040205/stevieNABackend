import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stevie Awards - Admin Dashboard",
  description: "Manage KB documents for Stevie Awards",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
