import type { HighlightClip } from "@/lib/types";

interface Props {
  highlights: HighlightClip[];
}

export default function HighlightsSection({ highlights }: Props) {
  if (!highlights || highlights.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-text-muted text-xs uppercase tracking-widest">Highlights</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {highlights.map((clip, i) => (
          <a
            key={i}
            href={clip.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col gap-2 bg-surface-overlay border border-surface-border rounded-xl overflow-hidden hover:border-accent-blue/50 transition-colors group"
          >
            {clip.thumbnail ? (
              <div className="relative aspect-video overflow-hidden bg-black/20">
                <img
                  src={clip.thumbnail}
                  alt={clip.title || "Highlight"}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </div>
            ) : (
              <div className="aspect-video bg-white/[0.04] flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-text-muted ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            )}
            <div className="px-3 pb-3">
              <p className="text-text-muted text-xs leading-snug line-clamp-2">
                {clip.title ||
                  (clip.event_type
                    ? `${clip.event_type}${clip.minute != null ? ` ${clip.minute}'` : ""}`
                    : "Watch clip")}
              </p>
              {clip.source && (
                <p className="text-text-subtle text-2xs mt-0.5">{clip.source}</p>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
