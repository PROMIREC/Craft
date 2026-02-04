import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Craft",
  description: "AI-assisted VR-to-manufacture cabinetry pipeline (V1 foundation)"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <div className="nav">
            <div className="navTitle">
              <a href="/">Craft</a>
              <span>CRG → DIB → PSPEC</span>
            </div>
            <div className="row">
              <a className="kbd" href="/projects/new">
                New Project
              </a>
              <a className="kbd" href="/settings">
                Settings
              </a>
            </div>
          </div>
          <div style={{ height: 16 }} />
          {children}
        </div>
      </body>
    </html>
  );
}
