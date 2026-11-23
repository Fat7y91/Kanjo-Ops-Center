import { GET as getTaxonomy } from "@/app/api/taxonomy/route";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET(): Promise<Response> {
  return getTaxonomy();
}
