"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/admin/api/session", {
        method: "DELETE", credentials: "same-origin", cache: "no-store",
      });
      if (!response.ok) throw new Error("Não foi possível encerrar a sessão.");
      router.replace("/acesso");
      router.refresh();
    } catch {
      setError("A sessão ainda pode estar ativa. Tente sair novamente.");
      setBusy(false);
    }
  }

  return (
    <>
      <button className="admin-logout" type="button" onClick={logout} disabled={busy}>
        <LogOut size={15} aria-hidden="true" />
        {busy ? "Saindo…" : "Sair"}
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
