import type { ReactNode } from "react";

import type { Metadata } from "next";

import { getMetadataBase } from "@/lib/app-config";

import "@/app/globals.css";

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "讨论实验室 · 先看谁值得问，再决定怎么做",
  description: "基于 SecondMe、知乎热点与可信搜的多代理 A2A 讨论实验室。",
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
