export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-accent" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
