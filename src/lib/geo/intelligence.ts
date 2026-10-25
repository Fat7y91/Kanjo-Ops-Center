import {
  EGYPT_CITIES,
  EGYPT_GOVERNORATES,
  findEgyptCity,
  findGovernorateForCity,
} from "@/lib/geo/egypt";
import type {
  EgyptCity,
  EgyptGovernorate,
  GeoCompetitionLevel,
  GeoIntelligence,
  GeoPolygon,
} from "@/lib/geo/types";

const EARTH_RADIUS_M = 6_371_008.8;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)) / 1000;
}

function ringVertices(polygon: GeoPolygon): Array<{ lat: number; lng: number }> {
  const ring = polygon.coordinates[0] ?? [];
  const vertices = ring.map(([lng, lat]) => ({ lat, lng }));
  if (vertices.length > 1) {
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    if (Math.abs(first.lat - last.lat) < 1e-9 && Math.abs(first.lng - last.lng) < 1e-9) {
      vertices.pop();
    }
  }
  return vertices;
}

/**
 * Projects lng/lat to a local tangent plane and uses the shoelace formula.
 * Accurate for operational city zones (a few kilometres across).
 */
function polygonMetrics(vertices: Array<{ lat: number; lng: number }>): {
  areaKm2: number;
  centroid: { lat: number; lng: number };
} {
  if (vertices.length < 3) {
    return { areaKm2: 0, centroid: { lat: 0, lng: 0 } };
  }

  const lat0 = vertices.reduce((sum, point) => sum + point.lat, 0) / vertices.length;
  const lng0 = vertices.reduce((sum, point) => sum + point.lng, 0) / vertices.length;
  const cosLat = Math.cos(toRadians(lat0));

  const projected = vertices.map((point) => ({
    x: toRadians(point.lng - lng0) * EARTH_RADIUS_M * cosLat,
    y: toRadians(point.lat - lat0) * EARTH_RADIUS_M,
  }));

  let twiceArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index];
    const next = projected[(index + 1) % projected.length];
    const cross = current.x * next.y - next.x * current.y;
    twiceArea += cross;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }

  const areaM2 = Math.abs(twiceArea) / 2;
  const centroid =
    Math.abs(twiceArea) > 1e-6
      ? {
          lat: lat0 + (centroidY / (3 * twiceArea)) / EARTH_RADIUS_M * (180 / Math.PI),
          lng: lng0 + (centroidX / (3 * twiceArea)) / (EARTH_RADIUS_M * cosLat) * (180 / Math.PI),
        }
      : { lat: lat0, lng: lng0 };

  return { areaKm2: areaM2 / 1_000_000, centroid };
}

function nearestCity(centroid: { lat: number; lng: number }): EgyptCity {
  let best = EGYPT_CITIES[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const city of EGYPT_CITIES) {
    const distance = haversineKm(centroid, { lat: city.lat, lng: city.lng });
    if (distance < bestDistance) {
      best = city;
      bestDistance = distance;
    }
  }
  return best;
}

function governorateFor(city: EgyptCity): EgyptGovernorate {
  return (
    findGovernorateForCity(city.id) ??
    EGYPT_GOVERNORATES[0]
  );
}

function urbanFactor(densityPerKm2: number): number {
  if (densityPerKm2 >= 2_500) return 0.92;
  if (densityPerKm2 >= 1_200) return 0.78;
  if (densityPerKm2 >= 500) return 0.6;
  if (densityPerKm2 >= 150) return 0.42;
  return 0.24;
}

function competitionLevel(index: number): GeoCompetitionLevel {
  if (index >= 70) return "high";
  if (index >= 40) return "medium";
  return "low";
}

const LEVEL_LABEL: Record<GeoCompetitionLevel, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "مرتفعة",
};

export function analyzePolygon(
  polygon: GeoPolygon,
  datasetCityId?: string,
): GeoIntelligence {
  const vertices = ringVertices(polygon);
  const { areaKm2: rawArea, centroid } = polygonMetrics(vertices);
  const safeArea = Math.max(rawArea, 0.01);

  const contextCity =
    (datasetCityId ? findEgyptCity(datasetCityId) : undefined) ??
    nearestCity(centroid);
  const governorate = governorateFor(contextCity);

  const governorateDensity = governorate.population / governorate.areaKm2;
  const averageCityPopulation =
    governorate.cities.length > 0
      ? governorate.population / governorate.cities.length
      : governorate.population;
  const cityScale = Math.min(
    3,
    Math.max(0.5, contextCity.population / Math.max(averageCityPopulation, 1)),
  );
  const density = Math.min(
    25_000,
    Math.max(governorateDensity * cityScale, 1),
  );
  const population = Math.round(
    safeArea * density * urbanFactor(density) * 0.62,
  );

  const commercialIntensity = Math.min(1.55, 0.8 + density / 4_000);
  const merchants = {
    restaurants: Math.round((population / 1_000) * 1.1 * commercialIntensity),
    cafes: Math.round((population / 1_000) * 1.7 * commercialIntensity),
    pharmacies: Math.round((population / 1_000) * 0.5),
    groceries: Math.round((population / 1_000) * 2.2),
    total: 0,
  };
  merchants.total =
    merchants.restaurants +
    merchants.cafes +
    merchants.pharmacies +
    merchants.groceries;

  const brandPressure =
    contextCity.population >= 5_000_000
      ? 25
      : contextCity.population >= 1_000_000
        ? 16
        : contextCity.population >= 300_000
          ? 10
          : 5;
  const merchantDensity = merchants.total / Math.max(safeArea, 0.25);
  const competitionIndex = Math.min(
    100,
    Math.round(merchantDensity * 2.2 + density / 90 + brandPressure),
  );
  const level = competitionLevel(competitionIndex);

  return {
    areaKm2: Number(rawArea.toFixed(2)),
    centroid: {
      lat: Number(centroid.lat.toFixed(5)),
      lng: Number(centroid.lng.toFixed(5)),
    },
    governorate: governorate.name,
    city: contextCity.name,
    cityId: contextCity.id,
    population,
    households: Math.round(population / 4.3),
    densityPerKm2: Math.round(population / safeArea),
    merchants,
    competition: {
      index: competitionIndex,
      level,
      label: LEVEL_LABEL[level],
    },
    generatedAt: new Date().toISOString(),
  };
}
