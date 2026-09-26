"use client";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { UpgradeProvider } from "./auth/upgrade-dialog";
import { MandateToaster } from "./mandates/mandate-toaster";
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
        <UpgradeProvider>
          {children}
          <MandateToaster />
        </UpgradeProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
