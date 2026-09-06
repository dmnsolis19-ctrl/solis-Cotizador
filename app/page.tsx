import CotizadorApp from "./cotizador-app";
import { redirect } from "next/navigation";
import { AuthorizationError, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  try { await requireSession(); }
  catch (error) { if (error instanceof AuthorizationError && error.status === 401) redirect("/login"); throw error; }
  return <CotizadorApp />;
}
