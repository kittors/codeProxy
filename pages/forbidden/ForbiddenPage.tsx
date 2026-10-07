import { ShieldX } from "lucide-react";
import { Link } from "react-router-dom";
import { buttonClassName } from "@code-proxy/ui";

/**
 * 无权访问。和空状态同一套语言：中性圆底图标、墨色标题、灰色说明，只是整页尺寸更大一档；
 * 不用红色——这不是出错，只是这个账号没有这项权限。
 */
export function ForbiddenPage() {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center text-center">
      <div className="flex flex-col items-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-hover text-ink-3">
          <ShieldX size={26} aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-ink">Access denied</h2>
        <p className="mt-2 text-sm text-ink-3">
          Your account does not have permission to open this page.
        </p>
        <Link to="/dashboard" className={`mt-6 ${buttonClassName({ variant: "primary" })}`}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
