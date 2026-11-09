import path from "node:path";
import { writeFileSync } from "node:fs";
import { loadTsModule, projectRoot } from "./lib/load-ts.mjs";

const doc = loadTsModule(path.join(projectRoot, "src/lib/contracts/render/pdf/document.ts"));
const input = {
  merchantId: "KJ-N3K4DG",
  merchantName: "سفير السعادة",
  businessType: "سوبر ماركت",
  category: "سوبر ماركت",
  displayRate: 12,
  baseCommission: 12,
  exceptions: [{ category: "عروض خاصة", rate: 8 }],
  vipPreContract: false,
  contactName: "أحمد محمود",
  contactPhone: "01012345678",
  address: "طنطا - الغربية",
  merchantLogo: "",
};
const bytes = await doc.renderContractDocument(input);
writeFileSync("/tmp/contract-new.pdf", bytes);
console.log("bytes", bytes.length);
