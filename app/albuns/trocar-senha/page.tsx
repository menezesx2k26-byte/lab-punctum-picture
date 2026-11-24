import { loadPublicSiteConfig } from "../../lib/server-content";
import { ClientAuthShell } from "../components/ClientAuthShell";
import { ClientLogin } from "../components/ClientLogin";

export const metadata = { title: "Escolher sua senha" };

export default async function PasswordPage() {
  const config = await loadPublicSiteConfig();
  return (
    <ClientAuthShell config={config}>
      <ClientLogin changePassword />
    </ClientAuthShell>
  );
}
