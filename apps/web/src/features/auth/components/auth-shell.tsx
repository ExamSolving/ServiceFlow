import {
  BriefcaseBusiness,
  CalendarCheck,
  FileText,
  PackageCheck,
} from "lucide-react";

interface AuthShellProps {
  children: React.ReactNode;
}

const features = [
  {
    icon: CalendarCheck,
    text: "Smart job scheduling",
  },
  {
    icon: BriefcaseBusiness,
    text: "Technician workflow",
  },
  {
    icon: FileText,
    text: "Quotes and invoicing",
  },
  {
    icon: PackageCheck,
    text: "Inventory management",
  },
];

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="min-h-screen bg-muted/30">
      <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="text-xl font-semibold">ServiceFlow</div>

            <div className="mt-24 max-w-lg">
              <h1 className="text-5xl font-semibold leading-tight tracking-tight">
                Run your service business smarter.
              </h1>

              <p className="mt-6 text-lg leading-8 text-slate-300">
                Manage customers, technicians, jobs, quotations and payments
                from one unified workspace.
              </p>

              <div className="mt-10 space-y-5">
                {features.map(({ icon: Icon, text }) => (
                  <div
                    key={text}
                    className="flex items-center gap-3 text-slate-200"
                  >
                    <div className="flex size-9 items-center justify-center rounded-lg bg-white/10">
                      <Icon className="size-4" />
                    </div>

                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="text-sm text-slate-500 mt-5">© 2026 ServiceFlow</p>
        </section>

        <section className="flex items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-md">{children}</div>
        </section>
      </div>
    </main>
  );
}
