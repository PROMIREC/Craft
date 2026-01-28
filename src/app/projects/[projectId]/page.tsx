import { ProjectDashboard } from "@/ui/ProjectDashboard";

export default function ProjectPage({ params }: { params: { projectId: string } }) {
  return (
    <div className="panel">
      <ProjectDashboard projectId={params.projectId} />
    </div>
  );
}

