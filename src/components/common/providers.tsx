"use client";

import { ThemeProvider } from "next-themes";
import { Direction } from "radix-ui";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/menu";

export function Providers({ children, dir }: { children: React.ReactNode; dir: "ltr" | "rtl" }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <Direction.Provider dir={dir}>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster
          position={dir === "rtl" ? "bottom-left" : "bottom-right"}
          dir={dir}
          toastOptions={{
            classNames: {
              toast: "!rounded-xl !border !border-border !bg-card !text-foreground !shadow-float !font-sans",
              description: "!text-muted-foreground",
            },
          }}
        />
      </Direction.Provider>
    </ThemeProvider>
  );
}
