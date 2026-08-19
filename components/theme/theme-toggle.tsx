"use client";

import { startTransition, useEffect, useEffectEvent, useState } from "react";

import { AdminButton } from "@/components/ui/admin-button";

type ThemeName = "dark" | "light";

const THEME_STORAGE_KEY = "discord-bot-theme";

function resolveTheme(): ThemeName {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeName>("dark");

  const syncTheme = useEffectEvent(() => {
    const nextTheme = resolveTheme();
    applyTheme(nextTheme);
    startTransition(() => {
      setTheme(nextTheme);
    });
  });

  useEffect(() => {
    syncTheme();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      if (!window.localStorage.getItem(THEME_STORAGE_KEY)) {
        syncTheme();
      }
    };

    mediaQuery.addEventListener("change", handleMediaChange);
    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, [syncTheme]);

  const nextTheme = theme === "dark" ? "light" : "dark";
  const buttonLabel = theme === "dark" ? "Sáng" : "Tối";

  return (
    <AdminButton
      className={`theme-toggle-button ${className}`.trim()}
      kind="soft"
      radius="full"
      size="sm"
      tone="default"
      onPress={() => {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
        startTransition(() => {
          setTheme(nextTheme);
        });
      }}
    >
      {buttonLabel}
    </AdminButton>
  );
}
