/** Static stand-in while a canvas map hydrates. No GeoJSON, no JS canvas. */
export default function AtlasMapPending({ label }: { label: string }) {
  return (
    <div className="atlas-map-pending" role="img" aria-label={label}>
      <p>{label}</p>
    </div>
  );
}
