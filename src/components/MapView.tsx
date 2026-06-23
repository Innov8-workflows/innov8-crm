"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { PIPELINE_STAGES } from "@/types";
import LoadingAI from "./LoadingAI";
import Icon from "./Icon";
import { useToast } from "./Toast";

// Inline map-pin SVG for the Leaflet popup (rendered from an HTML string, so it
// can't use the React <Icon> component).
const PIN_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:3px"><path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>`;

interface Marker {
  id: number;
  business_name: string;
  contact_name: string;
  business_type: string;
  location: string;
  lat: number;
  lng: number;
  status: string;
  owner: string;
}

interface MapStats {
  totalLeads: number;
  geocoded: number;
  pending: number;
  uniqueLocations: number;
}

const UK_CENTER: [number, number] = [54.5, -2.5];
const UK_ZOOM = 6;

// Used to pick a colour per pin based on stage
function stageColour(status: string): string {
  const stage = PIPELINE_STAGES.find((s) => s.value === status);
  return stage?.color || "#6B7280";
}

// Build a coloured circle marker icon as a data URL SVG — matches brand theme
function makeStageIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "crm-pin",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

// Cluster icon HTML
function makeClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 32 : count < 50 ? 40 : 50;
  return L.divIcon({
    className: "crm-cluster",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(234,88,12,0.85);border:3px solid #fff;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Inner component that receives the map instance via useMap() and manages the
// marker-cluster group. Lives inside <MapContainer> so it has map context.
function ClusteredMarkers({ markers }: { markers: Marker[] }) {
  const map = useMap();
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    // Initialise cluster group once (markerClusterGroup is added by the plugin import)
    const group = L.markerClusterGroup({
      iconCreateFunction: makeClusterIcon,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 50,
    });
    clusterGroupRef.current = group;
    map.addLayer(group);

    return () => {
      map.removeLayer(group);
      clusterGroupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = clusterGroupRef.current;
    if (!group) return;

    group.clearLayers();

    for (const m of markers) {
      const icon = makeStageIcon(stageColour(m.status));
      const marker = L.marker([m.lat, m.lng], { icon });

      const stageLabel = PIPELINE_STAGES.find((s) => s.value === m.status)?.label || m.status || "New";
      const popup = `
        <div style="font-family:'Bricolage Grotesque',sans-serif;min-width:200px">
          <div class="cf-name" style="font-weight:700;font-size:14px;margin-bottom:4px">${escape(m.business_name)}</div>
          <div style="font-size:12px;color:#666;margin-bottom:6px">
            ${m.contact_name ? `<span class="cf-name">${escape(m.contact_name)}</span> · ` : ""}${escape(m.business_type || "Unknown")}
          </div>
          <div style="font-size:11px;color:#888;margin-bottom:8px">${PIN_SVG}${escape(m.location)}</div>
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
            <span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${stageColour(m.status)};color:#fff;font-size:11px;font-weight:600">${stageLabel}</span>
            ${m.owner ? `<span style="font-size:11px;color:#666">${escape(m.owner)}</span>` : ""}
          </div>
        </div>`;
      marker.bindPopup(popup);
      group.addLayer(marker);
    }
  }, [markers]);

  return null;
}

// Escape HTML inside popup strings
function escape(s: string): string {
  return String(s || "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c
  ));
}

// Detect whether a dark theme is active (class like theme-midnight, theme-slate...)
function useIsDarkTheme(): boolean {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const check = () => {
      const cls = document.documentElement.className;
      setDark(!cls.includes("theme-light"));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export default function MapView({ ownerFilter = "" }: { ownerFilter?: string }) {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [stats, setStats] = useState<MapStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [businessTypeFilter, setBusinessTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [geocoding, setGeocoding] = useState(false);
  const isDark = useIsDarkTheme();
  const { toast } = useToast();
  // The view now unmounts when not active (frees Leaflet memory). Guard async
  // setState so a long-running geocode / fetch can't update an unmounted component.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const businessTypes = useMemo(() => {
    const set = new Set<string>();
    for (const m of markers) if (m.business_type) set.add(m.business_type);
    return Array.from(set).sort();
  }, [markers]);

  const fetchMarkers = useMemo(() => async () => {
    const params = new URLSearchParams();
    if (businessTypeFilter !== "All") params.set("business_type", businessTypeFilter);
    if (statusFilter !== "All") params.set("status", statusFilter);
    if (ownerFilter) params.set("owner", ownerFilter);

    const res = await fetch(`/api/leads/map?${params.toString()}`);
    const data = await res.json();
    if (!mountedRef.current) return;
    setMarkers(data.markers || []);
    setStats(data.stats || null);
    setLoading(false);
  }, [businessTypeFilter, statusFilter, ownerFilter]);

  useEffect(() => { fetchMarkers(); }, [fetchMarkers]);

  const [geocodeProgress, setGeocodeProgress] = useState({ done: 0, total: 0 });

  const runGeocode = async () => {
    if (geocoding) return;
    setGeocoding(true);
    setGeocodeProgress({ done: 0, total: 0 });
    toast("Geocoding leads… this may take a few minutes", "info");
    let totalGeocoded = 0;
    let totalFailed = 0;
    try {
      // Loop calling the endpoint until nothing remains. Max 30 iterations as a safety cap.
      for (let i = 0; i < 30; i++) {
        const res = await fetch("/api/leads/geocode", { method: "POST" });
        if (!res.ok) throw new Error("geocode failed");
        const data = await res.json();
        totalGeocoded += data.geocoded || 0;
        totalFailed += data.failed || 0;
        const processedThisRound = (data.geocoded || 0) + (data.failed || 0);
        if (!mountedRef.current) return;
        setGeocodeProgress((prev) => ({
          done: prev.done + processedThisRound,
          total: prev.done + processedThisRound + (data.remaining || 0),
        }));
        if (!data.remaining) break;
      }
      // Refresh the map once at the end — was redrawing on every batch (~15× heavy redraws).
      if (mountedRef.current) fetchMarkers();
      toast(`Geocoded ${totalGeocoded} location${totalGeocoded === 1 ? "" : "s"}${totalFailed ? `, ${totalFailed} unresolvable` : ""}`, "success");
    } catch {
      toast("Geocoding failed — please try again", "error");
    } finally {
      if (mountedRef.current) {
        setGeocoding(false);
        setGeocodeProgress({ done: 0, total: 0 });
      }
    }
  };

  if (loading) return <LoadingAI message="Loading map" />;

  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const tileAttribution = isDark
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Stats strip */}
      <div style={{ background: "var(--stats-bg)", borderBottom: "1px solid var(--border)" }} className="px-4 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Leads" value={stats?.totalLeads ?? 0} color="var(--text)" />
          <StatCard label="On Map" value={markers.length} color="var(--accent)" />
          <StatCard label="Pending Geocode" value={stats?.pending ?? 0} color="#f59e0b" />
          <StatCard label="Unique Locations" value={stats?.uniqueLocations ?? 0} color="#3b82f6" />
        </div>
      </div>

      {/* Filters bar */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }} className="px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Type</span>
          <select value={businessTypeFilter} onChange={(e) => setBusinessTypeFilter(e.target.value)}
            className="text-sm rounded-lg px-3 py-1.5"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)" }}>
            <option value="All">All</option>
            {businessTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Stage</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm rounded-lg px-3 py-1.5"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)" }}>
            <option value="All">All</option>
            {PIPELINE_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {geocoding && geocodeProgress.total > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-32 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface3)" }}>
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.round((geocodeProgress.done / geocodeProgress.total) * 100))}%`,
                    background: "var(--accent)",
                  }}
                />
              </div>
              <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                {geocodeProgress.done}/{geocodeProgress.total}
              </span>
            </div>
          )}
          {!geocoding && stats && stats.pending > 0 && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {stats.pending} lead{stats.pending === 1 ? "" : "s"} not yet on map
            </span>
          )}
          <button
            onClick={runGeocode}
            disabled={geocoding}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: geocoding ? "var(--surface3)" : "var(--accent)",
              color: "#fff",
              opacity: geocoding ? 0.7 : 1,
              cursor: geocoding ? "wait" : "pointer",
            }}
          >
            {geocoding ? "Geocoding…" : <span className="inline-flex items-center gap-1.5"><Icon name="refresh" className="w-4 h-4" /> Refresh Geocoding</span>}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }} className="px-4 py-2 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Legend</span>
        {PIPELINE_STAGES.map((s) => (
          <div key={s.value} className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, borderRadius: 5, background: s.color, border: "1.5px solid #fff" }} />
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Map */}
      <div className="flex-1 relative" style={{ background: "var(--bg)" }}>
        <MapContainer
          center={UK_CENTER}
          zoom={UK_ZOOM}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer url={tileUrl} attribution={tileAttribution} />
          <ClusteredMarkers markers={markers} />
        </MapContainer>

        {/* Empty state overlay — nothing geocoded yet */}
        {markers.length === 0 && stats && stats.pending > 0 && !geocoding && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 500 }}>
            <div className="pointer-events-auto max-w-md p-6 rounded-xl text-center" style={{
              background: "var(--surface)",
              border: "2px solid var(--accent)",
              boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
            }}>
              <div className="flex justify-center mb-2" style={{ color: "var(--accent)" }}><Icon name="map-pin" className="w-9 h-9" /></div>
              <h3 className="text-lg font-bold mb-2" style={{ color: "var(--text)" }}>No pins yet</h3>
              <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                You have <span style={{ color: "var(--accent)", fontWeight: 700 }}>{stats.pending}</span> leads waiting to be placed on the map.
                Hit the button below to geocode them — takes about a minute.
              </p>
              <button
                onClick={runGeocode}
                className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                <span className="inline-flex items-center gap-1.5"><Icon name="refresh" className="w-4 h-4" /> Start Geocoding</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
