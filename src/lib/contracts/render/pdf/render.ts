/**
 * Contract PDF rendering entry point.
 *
 * Renders the contract with the pure-JS engine (`pdf-lib` + `fontkit` +
 * `bidi-js`), which runs on Cloudflare's edge runtime because it never compiles
 * WebAssembly at request time. The old react-pdf pipeline was removed: its
 * flexbox engine (`yoga-layout`) instantiates an embedded WASM module, which
 * Workers forbids.
 *
 * A merchant logo is the one input that can vary in format; the resolver already
 * drops unsafe logos, but as a final guard a failed render is retried once
 * without it so an image problem never blocks the document.
 */

import type { ContractDocumentInput } from "../input";
import { renderContractDocument } from "./document";

export async function renderContractPdf(
  input: ContractDocumentInput,
): Promise<Uint8Array> {
  try {
    return await renderContractDocument(input);
  } catch (error) {
    if (!input.merchantLogo) throw error;
    console.error("Contract PDF render failed with merchant logo; retrying without it", error);
    return renderContractDocument({ ...input, merchantLogo: "" });
  }
}
