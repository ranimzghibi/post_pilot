import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path d="M8 16.6 23.4 8.6c.6-.3 1.3.2 1.1.9l-3.6 13.9c-.2.7-1 .9-1.5.5l-4.1-3.4-2.4 3.2c-.4.5-1.2.3-1.2-.4v-4.6L8.1 18c-.7-.3-.8-1.1-.1-1.4Z" fill="var(--primary-foreground)" />
      <circle cx="25" cy="24.5" r="2.2" fill="var(--warm)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="text-[15px]" dir="ltr">
        PostPilot
      </span>
    </span>
  );
}
