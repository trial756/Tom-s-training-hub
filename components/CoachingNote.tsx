export default function CoachingNote({
  feedback,
  vsLastTime,
  adjustments,
}: {
  feedback: string | null | undefined;
  vsLastTime?: string | null;
  adjustments?: string[] | null;
}) {
  if (!feedback) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2 rounded-xl border border-run/30 bg-run/10 p-3">
        <span className="text-base leading-none">🧠</span>
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-run">Coach Feedback</p>
          <p className="text-sm leading-snug text-gray-200">{feedback}</p>
        </div>
      </div>

      {vsLastTime && (
        <div className="flex gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
          <span className="text-base leading-none">🔁</span>
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-blue-400">Vs Last Time</p>
            <p className="text-sm leading-snug text-gray-200">{vsLastTime}</p>
          </div>
        </div>
      )}

      {adjustments && adjustments.length > 0 && (
        <div className="flex gap-2 rounded-xl border border-fuel/30 bg-fuel/10 p-3">
          <span className="text-base leading-none">🎯</span>
          <div className="flex-1">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-fuel">Adjustments</p>
            <ul className="space-y-1">
              {adjustments.map((a, i) => (
                <li key={i} className="flex gap-1.5 text-sm leading-snug text-gray-200">
                  <span className="text-fuel">•</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
