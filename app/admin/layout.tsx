import "./admin.css";
import "./components/private-gallery-admin.css";
import type { Metadata } from "next";
import { AdminShell } from "./components/AdminShell";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s — Painel Punctum" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
