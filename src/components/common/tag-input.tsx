"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function TagInput({
  value,
  onChange,
  placeholder,
  max = 40,
  disabled,
  id,
  tone = "neutral",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  disabled?: boolean;
  id?: string;
  tone?: "neutral" | "danger";
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const parts = draft
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length) {
      onChange(Array.from(new Set([...value, ...parts])).slice(0, max));
    }
    setDraft("");
  };

  return (
    <div className={cn("flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 shadow-card transition-[border-color,box-shadow] focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-ring", disabled && "opacity-60")}>
      {value.map((tag) => (
        <span key={tag} className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", tone === "danger" ? "bg-destructive-soft text-destructive" : "bg-secondary")}>
          {tag}
          {!disabled && (
            <button type="button" aria-label={`× ${tag}`} className="opacity-60 hover:opacity-100" onClick={() => onChange(value.filter((v) => v !== tag))}>
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      <input
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={value.length ? undefined : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
      />
    </div>
  );
}

export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  multiple,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  multiple?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(multiple ? (active ? value.filter((v) => v !== option.value) : [...value, option.value]) : [option.value])}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
              active ? "border-primary bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:border-input hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
