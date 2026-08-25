import { Zap } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <Zap size={18} fill="currentColor" />
      </span>
      {!compact && <span>ElectroMentor AI</span>}
    </div>
  );
}
