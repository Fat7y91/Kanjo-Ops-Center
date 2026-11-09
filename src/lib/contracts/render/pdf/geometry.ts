/**
 * Page geometry for the contract document.
 *
 * The engine flow (`DocumentWriter`) works between a fixed top and bottom
 * content boundary. The contract reserves a running-header band at the top and a
 * signature/footer band at the bottom on every content page, so this geometry
 * bakes those reserves into the margins. Chrome modules import `PAGE_MARGIN`
 * from here so the header, footer and content box never drift apart.
 */

import { A4, type PageGeometry } from "@/lib/pdf";

/** Symmetric horizontal page margin, in points. */
export const PAGE_MARGIN = 40;

/** Space reserved at the top of every content page for the running header. */
const HEADER_BAND = 62;

/** Space reserved at the bottom for signatures, page number and site footer. */
const FOOTER_BAND = 82;

/** Content-page geometry: A4 with the header/footer bands folded into margins. */
export const CONTRACT_PAGE: PageGeometry = {
  ...A4,
  marginTop: PAGE_MARGIN + HEADER_BAND,
  marginBottom: FOOTER_BAND,
  marginLeft: PAGE_MARGIN,
  marginRight: PAGE_MARGIN,
  continuationTopReserve: 0,
};
