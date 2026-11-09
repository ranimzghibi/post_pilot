import { cn } from "@/lib/utils";

/** Pictogrammes des réseaux, dessinés sur place : aucune requête vers un service tiers. */
export function NetworkIcon({ network, className }: { network: string; className?: string }) {
  if (network === "instagram") {
    return (
      <span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-[linear-gradient(135deg,#f9a03f,#e1306c_55%,#833ab4)] text-white", className)}>
        <svg viewBox="0 0 24 24" className="size-[70%]" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
        </svg>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-[#1877f2] text-white", className)}>
      <svg viewBox="0 0 24 24" className="size-[72%]" fill="currentColor" aria-hidden>
        <path d="M14 8.5V6.8c0-.8.5-1 1-1h2.2V2.1L14.3 2C11 2 9.8 4 9.8 6.5v2H7.5v3.8h2.3V22H14v-9.7h2.9l.5-3.8H14Z" />
      </svg>
    </span>
  );
}
