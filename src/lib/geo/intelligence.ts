import {
  EGYPT_CITIES,
  EGYPT_GOVERNORATES,
  findEgyptCity,
  findGovernorateForCity,
} from "@/lib/geo/egypt";
import type {
  EgyptCity,
  EgyptGovernorate,
  GeoPolygon,
  GeoZoneGeometry,
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
  return (2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))) / 1000;
}

function ringVertices(polygon: GeoPolygon): Array<{ lat: number; lng: number }> {
  const ring = polygon.coordinates[0] ?? [];
  const vertices = ring.map(([lng, lat]) => ({ lat, lng }));
  if (vertices.length > 1) {
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    if (
      Math.abs(first.lat - last.lat) < 1e-9 &&
      Math.abs(first.lng - last.lng) < 1e-9
    ) {
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

  const lat0 =
    vertices.reduce((sum, point) => sum + point.lat, 0) / vertices.length;
  const lng0 =
    vertices.reduce((sum, point) => sum + point.lng, 0) / vertices.length;
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
          lat:
            lat0 +
            (centroidY / (3 * twiceArea)) / EARTH_RADIUS_M * (180 / Math.PI),
          lng:
            lng0 +
            (centroidX / (3 * twiceArea)) /
              (EARTH_RADIUS_M * cosLat) *
              (180 / Math.PI),
        }
      : { lat: lat0, lng: lng0 };

  return { areaKm2: areaM2 / 1_000_000, centroid };
}

function perimeterKm(vertices: Array<{ lat: number; lng: number }>): number {
  if (vertices.length < 2) return 0;
  let total = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    total += haversineKm(vertices[index], vertices[(index + 1) % vertices.length]);
  }
  return total;
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
  return findGovernorateForCity(city.id) ?? EGYPT_GOVERNORATES[0];
}

/**
 * Measures the drawn boundary.
 *
 * Returns geometry only: area, perimeter, centroid and the reference
 * governorate the boundary falls inside. Merchant counts, population and
 * competition scores were removed because they were modelled guesses over a
 * static dataset, not observed facts; real merchant figures come from the
 * merchants directory instead.
 */
export function analyzePolygon(
  polygon: GeoPolygon,
  datasetCityId?: string,
): GeoZoneGeometry {
  const vertices = ringVertices(polygon);
  const { areaKm2, centroid } = polygonMetrics(vertices);

  const contextCity =
    (datasetCityId ? findEgyptCity(datasetCityId) : undefined) ??
    nearestCity(centroid);
  const governorate = governorateFor(contextCity);

  return {
    areaKm2: Number(areaKm2.toFixed(2)),
    perimeterKm: Number(perimeterKm(vertices).toFixed(2)),
    centroid: {
      lat: Number(centroid.lat.toFixed(5)),
      lng: Number(centroid.lng.toFixed(5)),
    },
    governorate: governorate.name,
    city: contextCity.name,
    cityId: contextCity.id,
    vertexCount: vertices.length,
    generatedAt: new Date().toISOString(),
  };
}
