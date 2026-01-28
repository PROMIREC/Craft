import { ProjectHome } from "@/ui/ProjectHome";

export default function HomePage() {
  return (
    <div className="panel">
      <h1 className="h1">Projects</h1>
      <p className="p">
        Create a project, upload a <span className="kbd">CRG</span> file, complete the{" "}
        <span className="kbd">DIB</span> interview, then review and approve a generated{" "}
        <span className="kbd">PSPEC</span>.
      </p>
      <ProjectHome />
    </div>
  );
}

