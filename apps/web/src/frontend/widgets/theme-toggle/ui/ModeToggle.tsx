// apps/web/src/frontend/widgets/theme-toggle/ui/ModeToggle.tsx
// ========================================================
// 概要:
// - テーマ切り替えのドロップダウンUI（Light / Dark / System）
//
// 責務:
// - ユーザー選択を next-themes の useTheme に渡して反映する
// ========================================================

"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/frontend/shared/ui/shadcn/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/frontend/shared/ui/shadcn/components/ui/dropdown-menu";
import { cn } from "@/frontend/shared/ui/shadcn/lib/utils";

type ThemeOption = {
  value: "light" | "dark" | "system";
  label: string;
};

const themeOptions: ThemeOption[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ModeToggle() {
  const { resolvedTheme, setTheme, theme } = useTheme();

  const activeTheme =
    theme === "system" ? "system" : (theme ?? resolvedTheme ?? "light");

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themeOptions.map((option) => {
          const isSelected = activeTheme === option.value;

          return (
            <DropdownMenuItem
              key={option.value}
              className={cn(
                "justify-between",
                isSelected && "bg-accent text-accent-foreground font-semibold",
              )}
              onClick={() => setTheme(option.value)}
            >
              <span className="flex-1">{option.label}</span>
              {isSelected && (
                <Check
                  className="ml-2 size-4 text-accent-foreground"
                  aria-hidden="true"
                />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
