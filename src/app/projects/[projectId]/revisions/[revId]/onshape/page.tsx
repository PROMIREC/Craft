import { OnshapePreview } from "@/ui/OnshapePreview";

export default function OnshapePreviewPage({ params }: { params: { projectId: string; revId: string } }) {
  return (
    <div className="panel">
      <OnshapePreview projectId={params.projectId} revId={params.revId} />
    </div>
  );
}

