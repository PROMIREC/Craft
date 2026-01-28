import { PspecReview } from "@/ui/PspecReview";

export default function ReviewPage({ params }: { params: { projectId: string } }) {
  return (
    <div className="panel">
      <PspecReview projectId={params.projectId} />
    </div>
  );
}

