import "../admin/admin.css";
import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Acesso ao painel",
  robots: { index: false, follow: false },
};

export default function AccessPage() {
  const adminAuthMode = Reflect.get(env, "ADMIN_AUTH_MODE");
  const clerkOnly = adminAuthMode === "clerk";
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
    (clerkOnly ||
      (clerkFlag && adminAuthMode !== "legacy" && adminAuthMode !== "password"));

  return (
    <main className="access-page">
      <div className="access-photo" aria-hidden="true">
        <Image
          src="/photos/p001.jpg"
          alt=""
          fill
          priority
          sizes="(max-width: 800px) 100vw, 54vw"
        />
      </div>
      <section className="access-panel">
        <Link className="access-wordmark" href="/">
          Punctum <span>Fotografia</span>
        </Link>
        <LoginForm
          clerkEnabled={clerkEnabled}
          clerkOnly={clerkOnly}
          publishableKey={clerkEnabled ? publishableKey : undefined}
        />
        <Link className="access-back" href="/">
          Voltar ao site
        </Link>
      </section>
    </main>
  );
}
