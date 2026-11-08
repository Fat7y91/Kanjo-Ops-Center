import type { ContractDocumentInput } from "../input";
import { loadContractPdf } from "./bootstrap";

/**
 * Renders the contract to PDF bytes on the edge runtime.
 *
 * Uses react-pdf's browser/edge entry (`pdf(...).toBuffer()`), which returns a
 * readable node stream rather than the Node-only `renderToBuffer`. The stream is
 * drained into a single `Uint8Array` so the caller can hash and upload it.
 */
export async function renderContractPdf(
  input: ContractDocumentInput,
): Promise<Uint8Array> {
  const { pdf: renderer, render } = await loadContractPdf();
  const React = await import("react");
  const element = React.createElement(render.ContractDocument, { input });
  const stream = await renderer.pdf(element as never).toBuffer();

  const chunks: Uint8Array[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });

  const total = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
