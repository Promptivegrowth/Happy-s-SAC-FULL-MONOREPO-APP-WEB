import { Card } from '@happy/ui/card';
import { Skeleton } from '@happy/ui/skeleton';

export default function Loading() {
  return (
    <article className="container px-4 py-10">
      <Skeleton className="mb-6 h-4 w-72" />
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="space-y-3">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        </div>
        <div className="space-y-5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <div className="space-y-3">
            <Skeleton className="h-12 w-48" />
            <div className="flex gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-12" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-3">
                <Skeleton className="mx-auto h-5 w-5" />
                <Skeleton className="mx-auto mt-2 h-3 w-16" />
                <Skeleton className="mx-auto mt-1 h-2 w-12" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
