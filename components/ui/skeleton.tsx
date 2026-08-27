import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-[rgba(var(--ink-rgb),0.07)]', className)}
      aria-hidden="true"
    />
  )
}

/** Mirrors SkillRow so the list does not reflow when data lands. */
export function SkillRowSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 border-b border-[rgba(var(--ink-rgb),0.09)] px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline">
      <div className="min-w-0">
        <Skeleton className="h-[15px] w-44" />
        <Skeleton className="mt-2 h-[13px] w-full max-w-md" />
      </div>
      <div className="flex items-baseline gap-6 sm:justify-end">
        <Skeleton className="h-[12px] w-32" />
        <Skeleton className="h-[12px] w-10" />
        <Skeleton className="h-[12px] w-[92px]" />
      </div>
    </div>
  )
}
