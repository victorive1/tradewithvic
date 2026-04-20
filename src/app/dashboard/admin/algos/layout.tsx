import type { ReactNode } from "react";
import { AdminGuard } from "@/components/admin/AdminGuard";

export const dynamic = "force-dynamic";

/**
 * Gate for /dashboard/admin/algos/*. Non-admin users are bounced back
 * to the main dashboard. The gate is client-side because auth is
 * stored in localStorage today — the sidebar also hides the Algos
 * section for non-admins so the URL isn't discoverable through normal
 * navigation.
 */
export default function AdminAlgosLayout({ children }: { children: ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
