"use client";

import { MobileSidebarDrawer, useSidebarDrawer } from "@/components/dashboard/Sidebar";
import { DashboardHeader } from "@/components/dashboard/Header";
import { NewsAlertBar } from "@/components/dashboard/NewsAlertBar";
import { SessionTimeBar } from "@/components/dashboard/SessionTimeBar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useSidebarDrawer();

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <SessionTimeBar />
      <DashboardHeader onMenuOpen={() => setOpen(true)} />
      <NewsAlertBar />
      <MobileSidebarDrawer open={open} onClose={() => setOpen(false)} />
      <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
    </div>
  );
}
