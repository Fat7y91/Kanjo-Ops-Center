"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";

import {
  currentTheme,
  THEME_EVENT,
  type Theme,
} from "@/lib/theme";

type ZonePoint = { lat: number; lng: number };

type CityZone = {
  id: string;
  name: string;
  stage: string;
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

const STAGE_COLORS: Record<Theme, Record<string, string>> = {
  light: {
    live_operations: "#137a4b",
    data_entry: "#5b21b6",
    contracting: "#a97900",
  },
  dark: {
    live_operations: "#4ade80",
    data_entry: "#c4a5ff",
    contracting: "#ffd700",
  },
};

function tileUrl(theme: Theme): string {
  return theme === "dark"
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
}

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
  const tileRef = useRef<Leaflet.TileLayer | null>(null);
  const libRef = useRef<typeof Leaflet | null>(null);
  const themeRef = useRef<Theme>("light");
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  const addPointRef = useRef(onAddPoint);
  addPointRef.current = onAddPoint;

  useEffect(() => {
    const syncTheme = () => {
      const next = currentTheme();
      themeRef.current = next;
      setTheme(next);
    };
    syncTheme();
    window.addEventListener(THEME_EVENT, syncTheme);
    return () => window.removeEventListener(THEME_EVENT, syncTheme);
  }, []);

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
      tileRef.current = leaflet
        .tileLayer(tileUrl(themeRef.current), {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 20,
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
      tileRef.current = null;
      libRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const leaflet = libRef.current;
    const map = mapRef.current;
    if (!ready || !leaflet || !map) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    tileRef.current = leaflet
      .tileLayer(tileUrl(theme), {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      })
      .addTo(map);
    tileRef.current.bringToBack();
  }, [theme, ready]);

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
    const palette = STAGE_COLORS[theme];

    cities.forEach((city) => {
      if (city.zone.length < 3) return;
      const color = palette[city.stage] ?? palette.contracting;
      leaflet
        .polygon(
          city.zone.map((point) => [point.lat, point.lng] as [number, number]),
          {
            color,
            weight: 2.5,
            fillColor: color,
            fillOpacity: theme === "dark" ? 0.22 : 0.16,
          },
        )
        .bindTooltip(city.name, { sticky: true })
        .addTo(layers);
    });

    if (draft.length > 0) {
      const draftColor = theme === "dark" ? "#ffd700" : "#230535";
      leaflet
        .polyline(
          draft.map((point) => [point.lat, point.lng] as [number, number]),
          { color: draftColor, weight: 2.5, dashArray: "6 6" },
        )
        .addTo(layers);
      draft.forEach((point, index) => {
        leaflet
          .circleMarker([point.lat, point.lng], {
            radius: 5,
            color: draftColor,
            fillColor: theme === "dark" ? "#230535" : "#ffffff",
            fillOpacity: 1,
            weight: 2.5,
          })
          .bindTooltip(`نقطة ${index + 1}`, { permanent: false })
          .addTo(layers);
      });
      if (draft.length >= 3) {
        leaflet
          .polygon(
            draft.map(
              (point) => [point.lat, point.lng] as [number, number],
            ),
            {
              color: draftColor,
              weight: 2.5,
              fillColor: theme === "dark" ? "#ffd700" : "#230535",
              fillOpacity: 0.22,
            },
          )
          .addTo(layers);
      }
    }
  }, [cities, draft, ready, theme]);

  return (
    <div
      ref={containerRef}
      className="city-map"
      style={{ height }}
      aria-label="خريطة النطاقات التشغيلية"
    />
  );
}
