/**
 * Page geometry for the contract document.
 *
 * The engine flow (`DocumentWriter`) works between a fixed top and bottom
 * content boundary. Executive print standards reserve a strict 22mm safe band at
 * the top and bottom of every content page: the running header lives inside the
 * top band and the copyright/page footer inside the bottom band, so clause text
 * can never collide with page chrome.
 */

import { A4, type PageGeometry } from "@/lib/pdf";

/** Executive 22mm safe margin, in points. */
export const PAGE_MARGIN = 62;

/** Space reserved above the content box for the running header. */
const HEADER_BAND = 40;

/** Content-page geometry: A4 with the header band folded into the top margin. */
export const CONTRACT_PAGE: PageGeometry = {
  ...A4,
  marginTop: PAGE_MARGIN + HEADER_BAND,
  marginBottom: PAGE_MARGIN,
  marginLeft: PAGE_MARGIN,
  marginRight: PAGE_MARGIN,
  continuationTopReserve: 0,
};
