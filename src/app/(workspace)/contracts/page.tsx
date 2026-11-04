import { ContractsIsland } from "@/components/contracts/contracts-island";
import { requireModuleAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Contract register shell.
 *
 * The page only resolves the session; the register, the scoped merchant list
 * and the city options arrive from `/api/contracts`, and every action button is
 * gated by the same capability the API checks. Nothing on this screen is a
 * placeholder: a new row, a signature and a cancellation are durable writes to
 * `app.contracts`.
 */
export default async function ContractsPage() {
  await requireModuleAccess("/contracts");

  return <ContractsIsland />;
}
