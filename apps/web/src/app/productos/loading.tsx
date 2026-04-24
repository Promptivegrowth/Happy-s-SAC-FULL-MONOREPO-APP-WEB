import { Card } from '@happy/ui/card';
import { Skeleton } from '@happy/ui/skeleton';

export default function Loading() {
  return (
    <div className="container px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Skeleton className="h-10 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-11 w-72" />
      </header>
      <Skeleton className="mb-4 h-4 w-40" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="aspect-square" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-5 w-24" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
