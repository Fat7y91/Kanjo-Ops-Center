type CatalogSummaryProps = {
  merchants: number;
  liveMerchants: number;
  products: number;
  pending: number;
};

/** Four headline numbers above the merchant grid. */
export function CatalogSummary({
  merchants,
  liveMerchants,
  products,
  pending,
}: CatalogSummaryProps) {
  const tiles = [
    { label: "تجار في النطاق", value: merchants },
    { label: "كتالوج منشور", value: liveMerchants },
    { label: "منتجات مُدخلة", value: products },
    { label: "بانتظار المراجعة", value: pending },
  ];

  return (
    <section className="cat-summary">
      {tiles.map((tile) => (
        <div key={tile.label} className="cat-summary-tile">
          <span>{tile.label}</span>
          <strong>{tile.value}</strong>
        </div>
      ))}
    </section>
  );
}
