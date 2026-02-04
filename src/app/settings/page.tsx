import { Suspense } from "react";
import { OnshapeConnectionCard } from "@/ui/OnshapeConnectionCard";

export default function SettingsPage() {
  return (
    <div className="panel">
      <Suspense fallback={<div className="alert">Loading settings...</div>}>
        <OnshapeConnectionCard />
      </Suspense>
    </div>
  );
}
