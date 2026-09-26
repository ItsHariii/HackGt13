"use client";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { UpgradeProvider } from "./auth/upgrade-dialog";
import { SessionProvider } from "./session-provider";
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <SessionProvider>
        <UpgradeProvider>{children}</UpgradeProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
