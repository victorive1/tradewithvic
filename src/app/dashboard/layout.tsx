import { DashboardSidebar } from "@/components/dashboard/Sidebar";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ChatWidget } from "@/components/chatbot/ChatWidget";
import { AuthBootstrap } from "@/components/auth/AuthBootstrap";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex">
      <AuthBootstrap />
      <DashboardSidebar />
      <DashboardShell>{children}</DashboardShell>
      <ChatWidget />
    </div>
  );
}
