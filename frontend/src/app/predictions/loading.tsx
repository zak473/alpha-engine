export default function PredictionsLoading() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      <div className="h-32 rounded-2xl bg-white/5" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-24 rounded-xl bg-white/5" />
        <div className="h-24 rounded-xl bg-white/5" />
        <div className="h-24 rounded-xl bg-white/5" />
      </div>
      <div className="h-48 rounded-2xl bg-white/5" />
    </div>
  );
}
