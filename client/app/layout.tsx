import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "vovonacci dashboard",
  description: "",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={"h-full antialiased"}>
      <body className="bg-[#0a0a0a] text-white antialiased">{children}</body>
    </html>
  );
}
