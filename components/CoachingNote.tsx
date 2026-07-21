export default function CoachingNote({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <div className="mt-3 flex gap-2 rounded-xl border border-accent/30 bg-accent/10 p-3">
      <span className="text-base leading-none">🧠</span>
      <p className="text-sm leading-snug text-gray-200">{text}</p>
    </div>
  );
}
