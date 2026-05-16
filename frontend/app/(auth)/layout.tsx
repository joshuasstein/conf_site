import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image
            src="/pvpmc_logo.png"
            alt="PVPMC Workshop"
            width={220}
            height={44}
            style={{ objectFit: "contain" }}
            priority
          />
          <p className="text-sm text-slate-500">Abstract Management</p>
        </div>
        {children}
      </div>
    </div>
  );
}
