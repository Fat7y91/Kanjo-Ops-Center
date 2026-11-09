/**
 * Contract document assembly for the Kanjo PDF engine.
 *
 * Builds the full contract: a dedicated branded cover (unnumbered), then the
 * content pages (party panels, preamble, numbered clauses, commission appendix,
 * copies note, summary with signatures, social/copyright footer). Per-page chrome
 * (running header, watermark, signature footer, page numbers) is added once the
 * page count is known, and excludes the cover so "page 1" is the first clause
 * page.
 */

import { DocumentWriter } from "@/lib/pdf";
import type { PDFImage } from "pdf-lib";

import type { ContractDocumentInput } from "../input";
import { decodeLogoDataUri, kanjoLogoBytes } from "./assets";
import { drawClauses, drawCommission } from "./clauses";
import { drawCover } from "./cover";
import { pageDecorations } from "./decorations";
import { CONTRACT_PAGE } from "./geometry";
import type { ChromeAssets } from "./header";
import { drawCopiesNote, drawPreamble } from "./notes";
import { drawParties } from "./parties";
import { drawSocial } from "./social";
import { drawSummary } from "./summary";

async function embedAssets(
  writer: DocumentWriter,
  input: ContractDocumentInput,
): Promise<ChromeAssets> {
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
  const writer = await DocumentWriter.create(CONTRACT_PAGE, "cover");
  const assets = await embedAssets(writer, input);

  drawCover(writer, input, assets.kanjo, assets.merchant);

  writer.addPage("content");
  drawParties(writer, input);
  drawPreamble(writer, input);
  drawClauses(writer, input);
  drawCommission(writer, input);
  drawCopiesNote(writer, input);
  drawSummary(writer, input);
  drawSocial(writer);

  return writer.finish(pageDecorations(assets, input));
}
