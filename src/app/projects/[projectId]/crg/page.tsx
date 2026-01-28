import { CrgUpload } from "@/ui/CrgUpload";

export default function CrgPage({ params }: { params: { projectId: string } }) {
  return (
    <div className="panel">
      <CrgUpload projectId={params.projectId} />
    </div>
  );
}

