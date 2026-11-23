import { ClientLogin } from "../components/ClientLogin";
import { SiteThemeRoot } from "../../components/SiteThemeRoot";
import { loadPublicExperience } from "../../lib/server-content";

export const metadata = { title: "Escolher sua senha" };
export default async function PasswordPage() {
  const { config } = await loadPublicExperience();
  return (
    <SiteThemeRoot config={config} className="punctum-access" ambientCursor={false}>
      <ClientLogin changePassword />
    </SiteThemeRoot>
  );
}
