'use client';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
interface Pin { id: string; name: string; open: number; centroid: { lng: number; lat: number } | null }
export default function AreaMap({ pins }: { pins: Pin[] }) {
  const c = pins[0]!.centroid!;
  return (<MapContainer center={[c.lat, c.lng]} zoom={12} className="h-[420px] rounded-lg border border-line" scrollWheelZoom={false}>
    <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
    {pins.map((p) => <CircleMarker key={p.id} center={[p.centroid!.lat, p.centroid!.lng]} radius={8 + Math.min(p.open, 20)} pathOptions={{ color: p.open ? '#C53030' : '#2E9E6B' }}><Popup>{p.name}: {p.open} open reviewed report(s)</Popup></CircleMarker>)}</MapContainer>);
}
