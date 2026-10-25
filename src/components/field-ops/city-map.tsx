"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";

type ZonePoint = { lat: number; lng: number };

type CityZone = {
  id: string;
  name: string;
  status: string;
  zone: ZonePoint[];
};

type CityMapProps = {
  cities?: CityZone[];
  draft?: ZonePoint[];
  editable?: boolean;
  onAddPoint?: (point: ZonePoint) => void;
  center?: [number, number];
  zoom?: number;
  height?: number;
};

const STATUS_COLORS: Record<string, string> = {
  active: "#137a4b",
  launching: "#6d4aff",
  planning: "#b8861e",
};

export function CityMap({
  cities = [],
  draft = [],
  editable = false,
  onAddPoint,
  center = [30.0444, 31.2357],
  zoom = 10,
  height = 320,
}: CityMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const libRef = useRef<typeof Leaflet | null>(null);
  const [ready, setReady] = useState(false);

  const addPointRef = useRef(onAddPoint);
  addPointRef.current = onAddPoint;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const leaflet = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = leaflet.map(containerRef.current, {
        scrollWheelZoom: false,
        zoomControl: true,
      });
      map.setView(center, zoom);
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        })
        .addTo(map);

      layerRef.current = leaflet.layerGroup().addTo(map);
      libRef.current = leaflet;
      mapRef.current = map;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      libRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    map.off("click");
    if (!editable) return;
    map.on("click", (event: Leaflet.LeafletMouseEvent) => {
      addPointRef.current?.({
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
      });
    });
    return () => {
      map.off("click");
    };
  }, [editable, ready]);

  useEffect(() => {
    const leaflet = libRef.current;
    const layers = layerRef.current;
    if (!ready || !leaflet || !layers) return;
    layers.clearLayers();

    cities.forEach((city) => {
      if (city.zone.length < 3) return;
      const color = STATUS_COLORS[city.status] ?? "#6d4aff";
      leaflet
        .polygon(
          city.zone.map((point) => [point.lat, point.lng] as [number, number]),
          {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.16,
          },
        )
        .bindTooltip(city.name, { sticky: true })
        .addTo(layers);
    });

    if (draft.length > 0) {
      leaflet
        .polyline(
          draft.map((point) => [point.lat, point.lng] as [number, number]),
          { color: "#6d4aff", weight: 2, dashArray: "6 6" },
        )
        .addTo(layers);
      draft.forEach((point, index) => {
        leaflet
          .circleMarker([point.lat, point.lng], {
            radius: 5,
            color: "#6d4aff",
            fillColor: "#ffffff",
            fillOpacity: 1,
            weight: 2,
          })
          .bindTooltip(`Point ${index + 1}`, { permanent: false })
          .addTo(layers);
      });
      if (draft.length >= 3) {
        leaflet
          .polygon(
            draft.map(
              (point) => [point.lat, point.lng] as [number, number],
            ),
            {
              color: "#4a2fbf",
              weight: 2,
              fillColor: "#6d4aff",
              fillOpacity: 0.22,
            },
          )
          .addTo(layers);
      }
    }
  }, [cities, draft, ready]);

  return (
    <div
      ref={containerRef}
      className="city-map"
      style={{ height }}
      aria-label="Operational zone map"
    />
  );
}
