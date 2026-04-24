import { Card, CardContent } from '@happy/ui/card';
import { Skeleton } from '@happy/ui/skeleton';

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          <div className="flex gap-4 border-b bg-slate-50 p-3">
            {Array.from({ length: cols }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex items-center gap-4 p-3">
              {Array.from({ length: cols }).map((_, c) => (
                <Skeleton key={c} className={`h-4 flex-1 ${c === 1 ? 'max-w-[40%]' : ''}`} />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function FiltersSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Skeleton className="h-10 w-80" />
      <Skeleton className="h-6 w-16" />
      <Skeleton className="h-6 w-20" />
      <Skeleton className="h-6 w-20" />
    </div>
  );
}

export function ListPageSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FiltersSkeleton />
      <TableSkeleton />
    </div>
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid gap-4 ${count === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-7 w-24" />
          <Skeleton className="mt-1 h-3 w-16" />
        </Card>
      ))}
    </div>
  );
}
