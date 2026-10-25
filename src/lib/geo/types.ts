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

export type GeoMerchantBreakdown = {
  restaurants: number;
  cafes: number;
  pharmacies: number;
  groceries: number;
  total: number;
};

export type GeoCompetitionLevel = "low" | "medium" | "high";

export type GeoIntelligence = {
  areaKm2: number;
  centroid: { lat: number; lng: number };
  governorate: string;
  city: string;
  cityId: string;
  population: number;
  households: number;
  densityPerKm2: number;
  merchants: GeoMerchantBreakdown;
  competition: {
    index: number;
    level: GeoCompetitionLevel;
    label: string;
  };
  generatedAt: string;
};
