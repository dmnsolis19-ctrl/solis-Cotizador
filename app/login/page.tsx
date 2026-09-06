"use client";

import { useEffect, useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      setNeedsSetup(Boolean(data.needsSetup)); setReady(true);
    }).catch(() => { setError("No fue posible comprobar el estado del acceso."); setReady(true); });
  }, []);

  async function submit(form: FormData) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth", {
        method: needsSetup ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: String(form.get("name") || ""), email: String(form.get("email") || ""), password: String(form.get("password") || "") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No fue posible continuar.");
      window.location.replace("/");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible continuar."); }
    finally { setBusy(false); }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10">
      <Card className="w-full max-w-md border-slate-800 shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="grid size-12 place-items-center rounded-xl bg-amber-400 text-slate-950"><LockKeyhole /></div>
          <div><CardTitle className="text-2xl">SOLIS Cotizador</CardTitle><CardDescription>{needsSetup ? "Cree la cuenta administradora inicial." : "Ingrese con su correo y contraseña."}</CardDescription></div>
        </CardHeader>
        <CardContent>
          {!ready ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="animate-spin" /> Preparando acceso…</div> : (
            <form action={submit} className="space-y-4">
              {needsSetup && <div className="space-y-2"><Label htmlFor="name">Nombre completo</Label><Input id="name" name="name" autoComplete="name" required /></div>}
              <div className="space-y-2"><Label htmlFor="email">Correo electrónico</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
              <div className="space-y-2"><Label htmlFor="password">Contraseña</Label><Input id="password" name="password" type="password" minLength={10} maxLength={128} autoComplete={needsSetup ? "new-password" : "current-password"} required /></div>
              {needsSetup && <p className="text-xs text-slate-500">Use al menos 10 caracteres. Esta cuenta tendrá el rol Administrador.</p>}
              {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <Button className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{needsSetup ? "Crear cuenta y entrar" : "Iniciar sesión"}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
