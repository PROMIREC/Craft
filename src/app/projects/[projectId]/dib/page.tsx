import { DibChat } from "@/ui/DibChat";

export default function DibPage({ params }: { params: { projectId: string } }) {
  return (
    <div className="panel">
      <DibChat projectId={params.projectId} />
    </div>
  );
}

