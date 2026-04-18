import { DashboardSidebar } from "@/components/dashboard/Sidebar";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ChatWidget } from "@/components/chatbot/ChatWidget";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex">
      <DashboardSidebar />
      <DashboardShell>{children}</DashboardShell>
      <ChatWidget />
    </div>
  );
}
