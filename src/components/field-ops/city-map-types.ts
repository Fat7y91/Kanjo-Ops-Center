export type ZonePoint = { lat: number; lng: number };

export type CityZone = {
  id: string;
  name: string;
  stage: string;
  zone: ZonePoint[];
};

export type CityMapProps = {
  cities?: CityZone[];
  draft?: ZonePoint[];
  editable?: boolean;
  onAddPoint?: (point: ZonePoint) => void;
  center?: [number, number];
  focus?: [number, number];
  focusZoom?: number;
  zoom?: number;
  height?: number;
};
