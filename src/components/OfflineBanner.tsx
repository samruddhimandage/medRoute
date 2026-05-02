import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";
import { useT } from "@/lib/i18n";

export function OfflineBanner() {
  const online = useOnline();
  const t = useT();
  if (online) return null;
  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-900 dark:text-amber-200">
      <div className="mx-auto max-w-6xl px-6 py-2 flex items-center gap-2 text-xs font-medium">
        <WifiOff className="h-3.5 w-3.5" />
        <span>{t("offline_banner")}</span>
      </div>
    </div>
  );
}

export default OfflineBanner;
