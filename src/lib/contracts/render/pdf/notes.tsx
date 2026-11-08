import { Text, View } from "@react-pdf/renderer";

import { styles } from "./styles";

/** The "التمهيد" preamble block, identical to V1 legal copy. */
export function Preamble() {
  return (
    <View style={styles.clauseWrapper}>
      <Text style={styles.clauseTitle}>التمهيد</Text>
      <Text style={styles.clauseBody}>
        حيث إن كانجو منصة إلكترونية تجارية وتشغيلية لعرض وطلب وتوصيل المنتجات، وحيث
        إن الطرف الثاني يرغب في الانضمام إليها؛ فقد اتفق الطرفان على تنظيم العلاقة
        بما يحفظ حقوق كانجو، ويضمن جودة المنتجات. ويعد هذا التمهيد وملاحق العقد
        جزءًا لا يتجزأ منه.
      </Text>
    </View>
  );
}

/** The two-copies note that closes the clauses. */
export function CopiesNote() {
  return (
    <Text style={styles.note}>
      تحرر هذا العقد من نسختين أصليتين متطابقتين، بِيَد كل طرف نسخة للعمل بموجبها،
      ويتكون العقد من البنود والملاحق المذكورة أعلاه.
    </Text>
  );
}
