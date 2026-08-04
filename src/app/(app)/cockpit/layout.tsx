import Image from "next/image";
import { logout } from "@/app/actions";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { getMyProfile } from "@/app/(app)/cockpit/actions";
import GlobalChatSidebar from "@/components/chat/GlobalChatSidebar";
import Providers from "@/components/Providers";
import CockpitRealtimeManager from "./CockpitRealtimeManager";
import CockpitSidebarNav from "./CockpitSidebarNav";
import CockpitUserMenu from "./_components/CockpitUserMenu";
import CockpitHelpButton from "@/components/CockpitHelpButton";

export default async function CockpitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getMyProfile();
  const userName = me?.nome_completo || "Usuário";
  const userEmail = me?.email || "";
  const userId = me?.id || "";
  const userInitials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <Providers>
      <CockpitRealtimeManager userId={userId} userName={userName} />
      <div className="h-screen flex bg-[#0A0A0A] text-gray-100 font-sans font-medium overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 flex flex-col border-r border-[#ffffff0a] bg-[#0F0F0F] relative z-20">
          <div className="h-20 flex items-center px-6 border-b border-[#ffffff0a]">
            <Image
              src="/logotipo.png"
              alt="HuginFlow"
              width={120}
              height={60}
              style={{ filter: "brightness(0) invert(1) opacity(0.9)" }}
            />
          </div>

          <CockpitSidebarNav isSuperAdmin={me?.role_global === "superadmin"} />

          <div className="p-4 border-t border-[#ffffff0a]">
            <CockpitUserMenu
              userName={userName}
              userEmail={userEmail}
              userInitials={userInitials}
            />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {/* Glow effect matching login */}
          <div
            className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-[0.03] pointer-events-none"
            style={{
              background: "radial-gradient(circle, #f97316 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />

          {/* Top Header */}
          <header className="h-20 flex-shrink-0 flex items-center justify-between px-8 border-b border-[#ffffff0a] bg-[#0A0A0A]/50 backdrop-blur-md sticky top-0 z-10">
            <h1 className="text-xl font-bold tracking-tight text-white/90 italic uppercase">
              Cockpit de Operações
            </h1>
            <div className="flex items-center gap-4">
              <CockpitHelpButton />
              <LanguageSwitcher />

              <div className="h-5 w-px bg-[#ffffff1a]"></div>
              <form action={logout}>
                <button type="submit" className="text-sm font-bold text-red-400/80 hover:text-red-400 transition-colors uppercase tracking-widest text-[9px] cursor-pointer">
                  Encerrar Sessão
                </button>
              </form>
            </div>
          </header>

          {/* Page Content */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-8">{children}</div>
          
          {/* Global Chat Sidebar (Floating Drawer) */}
          <GlobalChatSidebar />
        </main>
      </div>
    </Providers>
  );
}
