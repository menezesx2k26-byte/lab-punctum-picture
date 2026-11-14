import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ClerkPilotPanel } from "./ClerkPilotPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Clerk — laboratório privado Punctum",
  robots: { index: false, follow: false },
};

export default function ClerkPilotPage() {
  // No provider or public controls exist when this gate is disabled.
  if (Reflect.get(env, "CLERK_PILOT_ENABLED") !== "true") notFound();
  const publishableKey = Reflect.get(env, "CLERK_PUBLISHABLE_KEY") ??
    Reflect.get(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  if (typeof publishableKey !== "string" || !publishableKey) notFound();
  return <ClerkPilotPanel publishableKey={publishableKey} />;
}
