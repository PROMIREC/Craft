import { ArtifactsView } from "@/ui/ArtifactsView";

export default function ArtifactsPage({ params }: { params: { projectId: string } }) {
  return (
    <div className="panel">
      <ArtifactsView projectId={params.projectId} />
    </div>
  );
}

