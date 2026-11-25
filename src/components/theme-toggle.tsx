"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      className="icon-button border border-line bg-surface-raised shadow-[inset_0_1px_0_var(--glass-rim)]"
      aria-label={isDark ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted ? (isDark ? <Sun size={18} /> : <Moon size={18} />) : <span className="size-4" />}
    </button>
  );
}
