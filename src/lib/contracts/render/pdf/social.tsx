import { Text, View } from "@react-pdf/renderer";

import { styles } from "./styles";

const CURRENT_YEAR_AR = "٢٠٢٦";

/** Social handles and the copyright line that close the document. */
export function SocialFooter() {
  return (
    <View wrap={false}>
      <View style={styles.socialRow}>
        <Text style={styles.social}>facebook.com/kanjo.app.eg</Text>
        <Text style={styles.social}>instagram.com/kanjo.app.eg</Text>
        <Text style={styles.social}>tiktok.com/@kanjo.app.eg</Text>
      </View>
      <Text style={styles.copyright}>
        شركة كاند جوو لخدمات التوصيل والتجارة الإلكترونية - جميع الحقوق محفوظة ©{" "}
        {CURRENT_YEAR_AR}
      </Text>
    </View>
  );
}
