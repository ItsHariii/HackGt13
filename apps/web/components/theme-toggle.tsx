"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Toggle paper and blueprint theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Moon className="dark:hidden" size={18} aria-hidden="true" />
      <Sun className="hidden dark:block" size={18} aria-hidden="true" />
    </button>
  );
}
