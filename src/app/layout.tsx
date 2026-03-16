import type { ReactNode } from "react";

import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "找谁",
  description: "基于 SecondMe OAuth 的现实问题判断助手。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
