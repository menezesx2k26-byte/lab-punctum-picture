import { env } from "cloudflare:workers";
import { ClientLogin } from "../components/ClientLogin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar nos seus álbuns" };

export default function LoginPage() {
  const clientAuthMode = Reflect.get(env, "CLIENT_AUTH_MODE");
  const clerkOnly = clientAuthMode === "clerk";
  const clerkFlag = Reflect.get(env, "CLERK_AUTH_ENABLED") === "true";
  const rawPubKey =
    Reflect.get(env, "CLERK_PUBLISHABLE_KEY") ??
    Reflect.get(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const publishableKey =
    typeof rawPubKey === "string" && rawPubKey.trim()
      ? rawPubKey.trim()
      : undefined;
  const clerkEnabled =
    Boolean(publishableKey) &&
    (clerkOnly || (clerkFlag && clientAuthMode !== "access"));

  return (
    <ClientLogin
      clerkEnabled={clerkEnabled}
      clerkOnly={clerkOnly}
      publishableKey={clerkEnabled ? publishableKey : undefined}
    />
  );
}
