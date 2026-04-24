import { Card } from '@happy/ui/card';
import { Skeleton } from '@happy/ui/skeleton';
import { PageHeaderSkeleton, StatsSkeleton } from '@/components/skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatsSkeleton count={4} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-4 h-64 w-full" />
        </Card>
        <Card className="p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-4 h-64 w-full" />
        </Card>
      </div>
    </div>
  );
}
