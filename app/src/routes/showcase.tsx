import { Star } from "lucide-react";

export function ShowcaseRoute() {
  return (
    <div className="flex flex-col h-full overflow-y-auto px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Star className="h-5 w-5 text-gold" />
        <span className="awm-label">SHOWCASE</span>
      </div>
      <h1 className="text-4xl font-serif font-light text-fg mb-2">
        Achievements & Events
      </h1>
      <p className="text-fg-subtle text-sm mb-10">
        Milestones, client events, and highlights — coming soon.
      </p>
      <div className="flex items-center justify-center flex-1 border border-border rounded-sm">
        <p className="text-fg-subtle text-sm italic">
          This module is under construction.
        </p>
      </div>
    </div>
  );
}
