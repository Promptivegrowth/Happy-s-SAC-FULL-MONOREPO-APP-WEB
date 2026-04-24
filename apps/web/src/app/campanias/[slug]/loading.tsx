import { Card } from '@happy/ui/card';
import { Skeleton } from '@happy/ui/skeleton';

export default function Loading() {
  return (
    <>
      <section className="bg-gradient-to-br from-happy-500 via-danger to-corp-700 py-16">
        <div className="container px-4">
          <Skeleton className="h-6 w-32 bg-white/20" />
          <Skeleton className="mt-4 h-12 w-96 bg-white/20" />
          <Skeleton className="mt-3 h-4 w-2/3 bg-white/20" />
        </div>
      </section>
      <div className="container px-4 py-12">
        <Skeleton className="mb-6 h-4 w-40" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-square" />
              <div className="space-y-2 p-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-5 w-24" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
