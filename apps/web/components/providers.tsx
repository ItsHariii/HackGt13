"use client";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { SessionProvider } from "./session-provider";
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  );
}
