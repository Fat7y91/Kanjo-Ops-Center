export type GeoPolygon = {
  type: "Polygon";
  coordinates: Array<Array<[number, number]>>;
};

export type EgyptCity = {
  id: string;
  name: string;
  nameEn: string;
  lat: number;
  lng: number;
  population: number;
};

export type EgyptGovernorate = {
  id: string;
  name: string;
  nameEn: string;
  center: { lat: number; lng: number };
  population: number;
  areaKm2: number;
  cities: EgyptCity[];
};

/**
 * Measured geometry for a drawn zone.
 *
 * Only facts derived from the polygon itself are exposed. Population, merchant
 * headcounts and competition scores were removed: they were projections over a
 * static dataset, and presenting them as market intelligence misled operators.
 */
export type GeoZoneGeometry = {
  areaKm2: number;
  perimeterKm: number;
  centroid: { lat: number; lng: number };
  governorate: string;
  city: string;
  cityId: string;
  vertexCount: number;
  generatedAt: string;
};
