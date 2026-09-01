import { getMyProfile } from "@/app/(app)/cockpit/actions";
import Providers from "@/components/Providers";
import { buildCockpitNavPermissions } from "@/utils/cockpit-nav-permissions";
import CockpitShell from "./CockpitShell";

export default async function CockpitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getMyProfile();
  const userName = me?.nome_completo || "Usuário";
  const userEmail = me?.email || "";
  const userId = me?.id || "";
  const mustChangePassword = me?.must_change_password === true;
  const userInitials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <Providers>
      <CockpitShell
        userId={userId}
        userName={userName}
        userEmail={userEmail}
        userInitials={userInitials}
        mustChangePassword={mustChangePassword}
        isSuperAdmin={me?.role_global === "superadmin"}
        isAdminOrSuperAdmin={
          me?.role_global === "superadmin" || me?.role_global === "admin"
        }
        navPermissions={buildCockpitNavPermissions(me)}
        empresaId={me?.empresa_id ?? undefined}
      >
        {children}
      </CockpitShell>
    </Providers>
  );
}
