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
import { useToast } from "./Toast";

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
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">${escape(m.business_name)}</div>
          <div style="font-size:12px;color:#666;margin-bottom:6px">
            ${m.contact_name ? escape(m.contact_name) + " · " : ""}${escape(m.business_type || "Unknown")}
          </div>
          <div style="font-size:11px;color:#888;margin-bottom:8px">📍 ${escape(m.location)}</div>
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
    setMarkers(data.markers || []);
    setStats(data.stats || null);
    setLoading(false);
  }, [businessTypeFilter, statusFilter, ownerFilter]);

  useEffect(() => { fetchMarkers(); }, [fetchMarkers]);

  const runGeocode = async () => {
    if (geocoding) return;
    setGeocoding(true);
    toast("Geocoding leads… this may take a minute", "info");
    let totalGeocoded = 0;
    let totalFailed = 0;
    try {
      // Loop calling the endpoint until nothing remains
      for (let i = 0; i < 20; i++) {
        const res = await fetch("/api/leads/geocode", { method: "POST" });
        const data = await res.json();
        totalGeocoded += data.geocoded || 0;
        totalFailed += data.failed || 0;
        if (!data.remaining) break;
      }
      toast(`Geocoded ${totalGeocoded} location${totalGeocoded === 1 ? "" : "s"}${totalFailed ? `, ${totalFailed} unresolvable` : ""}`, "success");
      fetchMarkers();
    } catch {
      toast("Geocoding failed — please try again", "error");
    } finally {
      setGeocoding(false);
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
        <div className="ml-auto flex items-center gap-2">
          {stats && stats.pending > 0 && (
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
            {geocoding ? "Geocoding…" : "🔄 Refresh Geocoding"}
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
      <div className="flex-1" style={{ background: "var(--bg)" }}>
        <MapContainer
          center={UK_CENTER}
          zoom={UK_ZOOM}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer url={tileUrl} attribution={tileAttribution} />
          <ClusteredMarkers markers={markers} />
        </MapContainer>
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
