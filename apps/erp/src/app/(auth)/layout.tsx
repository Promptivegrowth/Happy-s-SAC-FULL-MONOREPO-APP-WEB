export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-corp-900">
      {/* Decorativos */}
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-happy-500/30 blur-3xl" />
      <div className="absolute -right-40 bottom-0 h-[28rem] w-[28rem] rounded-full bg-corp-700/40 blur-3xl" />
      <div className="absolute right-1/3 top-1/4 h-72 w-72 rounded-full bg-danger/20 blur-3xl" />

      <div className="relative flex min-h-screen items-center justify-center p-4 py-8">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </main>
  );
}
