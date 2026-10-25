"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";

import type { CityMapProps, ZonePoint } from "@/components/field-ops/city-map-types";
import { currentTheme, THEME_EVENT, type Theme } from "@/lib/theme";

const STAGE_COLORS: Record<Theme, Record<string, string>> = {
  light: {
    preparation: "#1d6fa5",
    live_operations: "#137a4b",
    data_entry: "#5b21b6",
    contracting: "#a97900",
  },
  dark: {
    preparation: "#7cc4ff",
    live_operations: "#4ade80",
    data_entry: "#c4a5ff",
    contracting: "#ffd700",
  },
};

const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function CityMapInner({
  cities = [],
  draft = [],
  editable = false,
  onAddPoint,
  center = [30.0444, 31.2357],
  focus,
  focusZoom = 12,
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
    let resizeObserver: ResizeObserver | null = null;

    void (async () => {
      const leaflet = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: "/marker-icon-2x.png",
        iconUrl: "/marker-icon.png",
        shadowUrl: "/marker-shadow.png",
      });

      const map = leaflet.map(containerRef.current, {
        scrollWheelZoom: false,
        zoomControl: true,
        preferCanvas: true,
      });
      map.setView(center, zoom);

      tileRef.current = leaflet
        .tileLayer(OSM_TILES, {
          attribution: OSM_ATTRIBUTION,
          subdomains: "abc",
          maxZoom: 19,
          detectRetina: true,
        })
        .addTo(map);

      layerRef.current = leaflet.layerGroup().addTo(map);
      libRef.current = leaflet;
      mapRef.current = map;

      map.whenReady(() => {
        map.invalidateSize();
        window.requestAnimationFrame(() => map.invalidateSize());
        setReady(true);
      });

      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(containerRef.current);
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      tileRef.current = null;
      libRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.invalidateSize();
  }, [height, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    map.flyTo(focus, focusZoom, { duration: 0.9, easeLinearity: 0.28 });
  }, [focus, focusZoom, ready]);

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
      const color = palette[city.stage] ?? palette.preparation;
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
            draft.map((point) => [point.lat, point.lng] as [number, number]),
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
      className="city-map leaflet-container"
      style={{ height, width: "100%", minHeight: height }}
      aria-label="خريطة النطاقات التشغيلية"
    />
  );
}

export type { ZonePoint };
