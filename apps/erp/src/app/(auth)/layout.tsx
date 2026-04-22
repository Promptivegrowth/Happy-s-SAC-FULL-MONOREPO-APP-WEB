export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-happy-500 via-carnival-pink to-carnival-purple p-4">
      <div className="flex min-h-screen items-center justify-center py-8">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </main>
  );
}
