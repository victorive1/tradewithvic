"use client";

import { MobileSidebarDrawer, useSidebarDrawer } from "@/components/dashboard/Sidebar";
import { DashboardHeader } from "@/components/dashboard/Header";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useSidebarDrawer();

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <DashboardHeader onMenuOpen={() => setOpen(true)} />
      <MobileSidebarDrawer open={open} onClose={() => setOpen(false)} />
      <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
    </div>
  );
}
