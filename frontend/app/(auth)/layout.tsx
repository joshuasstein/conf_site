export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600">ConfSite</h1>
          <p className="text-sm text-slate-500 mt-1">Conference Abstract Management</p>
        </div>
        {children}
      </div>
    </div>
  );
}
