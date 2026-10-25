import type { City } from "@/lib/field-ops/types";

/**
 * Firestore-ready city document.
 *
 * `boundary` is a closed GeoJSON linear ring stored as [longitude, latitude]
 * pairs, which maps directly onto a Firestore map/array field. `zone` is kept
 * as the editable vertex list used by the map editor.
 */
export type CityFirestoreDocument = {
  id: string;
  name: string;
  country: string;
  governorate: string;
  population: number;
  stage: City["stage"];
  competitors: City["competitors"];
  strategicNotes: string;
  zone: City["zone"];
  boundary: City["boundary"];
  createdAt: string;
  createdBy: string;
  createdByName: string;
};

export function toCityFirestoreDocument(city: City): CityFirestoreDocument {
  return {
    id: city.id,
    name: city.name,
    country: city.country,
    governorate: city.governorate,
    population: city.population,
    stage: city.stage,
    competitors: city.competitors,
    strategicNotes: city.strategicNotes,
    zone: city.zone,
    boundary: city.boundary,
    createdAt: city.createdAt,
    createdBy: city.createdBy,
    createdByName: city.createdByName,
  };
}
