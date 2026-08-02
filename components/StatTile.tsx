export default function StatTile({
  label,
  value,
  unit,
  accentColor = "#00e676",
}: {
  label: string;
  value: string | number;
  unit?: string;
  accentColor?: string;
}) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className="text-2xl font-bold text-ink">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-muted">{unit}</span>}
      </span>
      <div className="h-1 w-8 rounded-full" style={{ backgroundColor: accentColor }} />
    </div>
  );
}
