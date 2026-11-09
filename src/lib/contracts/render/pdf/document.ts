/**
 * Contract document assembly for the Kanjo PDF engine.
 *
 * Builds the full A4 contract on the pure-JS engine: masthead, party panels,
 * preamble, numbered clauses, commission appendix, copies note, summary with
 * signatures, and the social/copyright footer, then adds the watermark, inner
 * page headers and page numbers once the page count is known.
 *
 * This replaces the former react-pdf component tree. Keeping assembly separate
 * from rendering means the order the sections print in lives in one readable
 * function rather than being implied by React component nesting.
 */

import { A4, DocumentWriter } from "@/lib/pdf";
import type { PDFImage } from "pdf-lib";

import type { ContractDocumentInput } from "../input";
import { decodeLogoDataUri, kanjoLogoBytes } from "./assets";
import { drawClauses, drawCommission } from "./clauses";
import { pageDecorations } from "./decorations";
import { drawHeader, type HeaderAssets } from "./header";
import { drawCopiesNote, drawPreamble } from "./notes";
import { drawParties } from "./parties";
import { drawSocial } from "./social";
import { drawSummary } from "./summary";

async function embedAssets(
  writer: DocumentWriter,
  input: ContractDocumentInput,
): Promise<HeaderAssets> {
  const kanjo = await writer.embedImage(kanjoLogoBytes());

  let merchant: PDFImage | null = null;
  const merchantBytes = decodeLogoDataUri(input.merchantLogo);
  if (merchantBytes) merchant = await writer.embedImage(merchantBytes);

  return { kanjo, merchant };
}

/**
 * Renders a contract to PDF bytes.
 *
 * Merchant logos are best-effort: an undecodable or unsupported image is simply
 * omitted, so a bad logo never blocks the document. The caller retries without a
 * logo only if the whole render fails.
 */
export async function renderContractDocument(
  input: ContractDocumentInput,
): Promise<Uint8Array> {
  const writer = await DocumentWriter.create(A4);
  const assets = await embedAssets(writer, input);

  drawHeader(writer, input, assets);
  drawParties(writer, input);
  drawPreamble(writer);
  drawClauses(writer, input);
  drawCommission(writer, input);
  drawCopiesNote(writer);
  drawSummary(writer, input);
  drawSocial(writer);

  return writer.finish(pageDecorations(assets.kanjo, input));
}
