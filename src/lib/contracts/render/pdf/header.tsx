import { Image, Text, View } from "@react-pdf/renderer";

import { KANJO_LOGO_BASE64 } from "../data/pdf-assets";
import { contractDocumentTitle } from "../title";
import type { ContractDocumentInput } from "../input";
import { styles } from "./styles";

const KANJO_LOGO = `data:image/jpeg;base64,${KANJO_LOGO_BASE64}`;

type HeaderProps = { input: ContractDocumentInput };

/** Logo row plus the contract title ("عقد انضمام …"). */
export function ContractHeader({ input }: HeaderProps) {
  const merchantLogo = input.merchantLogo || "";
  const split = Boolean(merchantLogo);

  return (
    <View>
      <View style={split ? styles.headerSplit : styles.header}>
        <Image style={styles.logo} src={KANJO_LOGO} />
        {split ? <Image style={styles.merchantLogo} src={merchantLogo} /> : null}
      </View>
      <Text style={styles.title}>{contractDocumentTitle(input)}</Text>
    </View>
  );
}
