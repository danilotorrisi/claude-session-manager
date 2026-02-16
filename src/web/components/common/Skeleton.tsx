interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/** A single animated pulse bar. Compose multiples for layout skeletons. */
export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-default-200 rounded ${className}`}
      style={style}
    />
  );
}

/** Skeleton rows mimicking the session table layout. */
export function SessionTableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Header row */}
      <div className="flex gap-4 px-3 py-2">
        <Skeleton className="h-4 w-6" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-14" />
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-3 py-3 rounded-lg bg-content1">
          <Skeleton className="h-4 w-6" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton for session detail page: info card + log area. */
export function SessionDetailSkeleton() {
  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Breadcrumb */}
      <Skeleton className="h-4 w-48" />
      {/* Title row */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      {/* Info card */}
      <div className="rounded-xl bg-content1 p-4 space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      {/* Log area */}
      <div className="flex-1 rounded-xl bg-content1 p-4 space-y-2">
        <Skeleton className="h-4 w-20 mb-3" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" style={{ maxWidth: `${70 + Math.random() * 30}%` } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}

/** Skeleton cards for Projects / Hosts table views. */
export function TableSkeleton({ rows = 3, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex gap-4 px-3 py-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-24" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-3 py-3 rounded-lg bg-content1">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 w-28" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton cards for the Tasks view issue list. */
export function TaskCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl bg-content1 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 flex-1 max-w-xs" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-full max-w-sm" />
        </div>
      ))}
    </div>
  );
}
