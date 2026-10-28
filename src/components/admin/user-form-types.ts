/** Shared shapes for the Users/RBAC dialogs. */

export type LevelOption = { level: number; label: string };
export type CityOption = { id: string; name: string };

export type CreateForm = {
  name: string;
  email: string;
  title: string;
  team: string;
  clearanceLevel: string;
  cityIds: string[];
};

export function emptyForm(
  levels: LevelOption[],
  cities: CityOption[],
): CreateForm {
  return {
    name: "",
    email: "",
    title: "",
    team: "Fox Team",
    clearanceLevel: String(levels[levels.length - 1]?.level ?? 1),
    cityIds: cities.length === 1 ? [cities[0].id] : [],
  };
}
