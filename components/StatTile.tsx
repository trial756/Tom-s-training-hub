export default function StatTile({
  label,
  value,
  unit,
  accentColor = "#ff5b2e",
}: {
  label: string;
  value: string | number;
  unit?: string;
  accentColor?: string;
}) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-2xl font-bold text-white">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-gray-400">{unit}</span>}
      </span>
      <div className="h-1 w-8 rounded-full" style={{ backgroundColor: accentColor }} />
    </div>
  );
}
