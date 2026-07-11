import { ShieldX } from "lucide-react";
import { Link } from "react-router-dom";

export function ForbiddenPage() {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center text-center">
      <div>
        <ShieldX className="mx-auto mb-5 text-rose-500" size={48} />
        <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">Access denied</h2>
        <p className="mt-2 text-sm text-slate-500">
          Your account does not have permission to open this page.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white/10"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
