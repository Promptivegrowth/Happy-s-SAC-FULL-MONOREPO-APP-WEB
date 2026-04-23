import { Logo } from '@happy/ui/logo';

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Logo height={48} className="animate-pulse" />
        <div className="h-1 w-24 overflow-hidden rounded-full bg-happy-100">
          <div className="h-full w-1/3 animate-shimmer bg-happy-gradient" />
        </div>
      </div>
    </div>
  );
}
