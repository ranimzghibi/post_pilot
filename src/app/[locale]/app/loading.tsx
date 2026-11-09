import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="animate-rise space-y-6" aria-busy>
      <div className="space-y-2.5">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="w-80 max-w-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-56 rounded-xl lg:col-span-2" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}
