import { Document, Image, Page, Text, View } from "@react-pdf/renderer";

import { KANJO_LOGO_BASE64 } from "../data/pdf-assets";
import type { ContractDocumentInput } from "../input";
import { Clauses } from "./clauses";
import { CommissionTable } from "./commission";
import { ContractHeader } from "./header";
import { CopiesNote, Preamble } from "./notes";
import { Parties } from "./parties";
import { SocialFooter } from "./social";
import { styles } from "./styles";
import { Summary } from "./summary";

const WATERMARK = `data:image/jpeg;base64,${KANJO_LOGO_BASE64}`;

type Props = { input: ContractDocumentInput };

function Footer() {
  return (
    <View fixed style={styles.footerWrap}>
      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) =>
          `صفحة ${toEastern(pageNumber)} من ${toEastern(totalPages)}`
        }
      />
    </View>
  );
}

function toEastern(value: number): string {
  const digits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return String(value).replace(/[0-9]/g, (d) => digits[Number(d)]!);
}

/**
 * Full A4 contract document.
 *
 * Mirrors the V1 HTML body in print: fixed watermark, logo header + title, the
 * party panels and preamble, numbered clauses, the commission table, the
 * copies note, the signature summary, and the social/copyright footer. Page
 * numbers are drawn by the fixed footer.
 */
export function ContractDocument({ input }: Props) {
  return (
    <Document title="عقد انضمام" author="Kanjo">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.watermarkWrap} fixed>
          <Image style={styles.watermark} src={WATERMARK} />
        </View>
        <Footer />

        <ContractHeader input={input} />
        <Parties input={input} />
        <Preamble />
        <Clauses input={input} />
        <CommissionTable input={input} />
        <CopiesNote />
        <Summary input={input} />
        <SocialFooter />
      </Page>
    </Document>
  );
}
