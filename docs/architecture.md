# AI‑Assisted VR‑to‑Manufacture Cabinetry System

> Canonical normative architecture document for Craft.
>
> Note: `docs/Architecture.md` may exist as a legacy, case-variant copy for editor convenience.

## 1. Purpose and Vision
This document defines the architecture, intent, and guiding principles of an AI-assisted system that translates free-form spatial design into manufacturable cabinetry outputs.

The system is designed to be implemented and orchestrated by AI agents (e.g. in a VS Code-based development environment). This document functions as a **normative anchor** for those agents: it specifies what the system *is*, *is not*, and *must never assume*.

The user interface is explicitly multi-modal and staged:
- Spatial design input (free-form, non-authoritative)
- Conversational constraint resolution (authoritative)
- Passive review and approval (authoritative checkpoints)

The system is explicitly **not** a mesh-to-CAD converter. It is a design-translation system that mediates between conceptual freedom and fabrication constraints through structured dialogue, parametric reconstruction, and manufacturability logic.

---

## 2. Core Design Philosophy

### 2.1 Separation of Concerns
The system enforces a strict separation between:
- **Conceptual geometry** (expressive, imprecise, human‑driven)
- **Parametric structure** (explicit dimensions, relations, tolerances)
- **Manufacturing logic** (materials, joinery, hardware, tolerances)

Each layer is translated explicitly; no layer is inferred implicitly.

### 2.2 Constraint‑First Reconstruction
The system does not attempt to preserve every sculptural detail. Instead, it prioritizes:
- Functional intent
- Proportional relationships
- Component adjacency and hierarchy

A design is considered successful if it is *faithful in intent* and *sound in fabrication*, not if it is geometrically identical to the VR mesh.

### 2.3 Human Authority, AI Responsibility
- The human defines intent, taste, and acceptance criteria
- The AI defines completeness, consistency, and manufacturability

The AI is responsible for detecting underspecification and refusing to proceed without resolving it.

---

## 3. System Scope (Explicit Inclusions / Exclusions)

### Included
- Furniture‑scale cabinetry (record consoles, credenzas, shelving)
- Sheet‑good construction (plywood, MDF, veneered panels)
- Parametric CAD output (Onshape‑compatible)
- Blueprint‑grade drawings and cut lists
- Mechanical vibration isolation strategies (where applicable)

### Excluded (by design)
- Organic or sculptural joinery
- Free‑form CNC carving
- Acoustic enclosure design (beyond isolation)
- Real‑time CAD interaction by the user

---

## 4. Canonical Object Model

The system treats furniture as an **assembly of roles**, not shapes.

### 4.1 Object Roles
- Structural shell (load‑bearing)
- Contained objects (equipment, speakers, drawers)
- Interfaces (openings, access, ventilation)
- Isolation layers (mechanical, thermal, acoustic)

Each role has constraints, regardless of visual form.

### 4.2 Black‑Box Components
Certain elements (e.g. speakers, turntables, amplifiers) are treated as opaque solids with:
- External dimensions
- Mass
- Access and clearance requirements

No assumptions are made about their internal behaviour.

---

## 5. User Interface and Input Model

This section defines **how the user provides designs to the system** and how those inputs are interpreted. It is written to serve as an explicit contract for AI agents implementing the interface layer.

### 5.1 Input Artifacts (Authoritativeness Levels)

The system operates on three distinct input artifacts. Each artifact has a clearly defined authority level.

1. **Concept Reference Geometry (CRG)**
   - A mesh-based 3D export originating from free-form design tools (e.g. VR modeling environments).
   - Accepted formats (ordered by preference): GLB / GLTF, FBX, OBJ.
   - The CRG is *non-authoritative*.
   - Its sole function is to communicate proportions, spatial relationships, symmetry, and rough partitioning.
   - The system must never treat CRG geometry as manufacturable surfaces or dimensions.

2. **Design Intent Brief (DIB)**
   - A structured, AI-guided interrogation conducted via conversational or form-based UI.
   - Captures all information that cannot be reliably inferred from geometry, including:
     - Materials and construction method
     - Joinery preferences
     - Clearances and tolerances
     - Access, ventilation, and service requirements
     - Isolation strategies
     - Hardware and finish assumptions
   - The DIB is *authoritative* once confirmed by the user.

3. **Parametric Specification (PSPEC)**
   - A machine-readable schema (e.g. JSON) synthesised from CRG + DIB.
   - PSPEC is the **single source of truth** for CAD generation.
   - All downstream operations depend exclusively on PSPEC.

### 5.2 User Interaction Modes

The system may expose multiple interaction modes. All modes must resolve into the same three input artifacts.

- **File-Based Intake**
  - The user drops a CRG file into a watched directory.
  - This action triggers the Intake Agent.

- **Conversational Mode**
  - The user interacts with agents through chat.
  - Used primarily for the DIB interrogation and clarification loops.

- **Form-Based Mode (Optional)**
  - A structured UI that mirrors the DIB schema.
  - Intended for advanced users or batch operation.

V1 must support File-Based Intake + Conversational Mode.

### 5.3 User Control Surface

The user is never exposed to CAD-level controls.

The user may only:
- Upload or replace the CRG file
- Answer or revise DIB responses
- Inspect a human-readable summary of PSPEC
- Edit PSPEC values at the parameter level
- Approve or reject generation steps
- Select an output profile (e.g. hand tools, panel saw, CNC shop)

Any requirement for direct CAD manipulation constitutes a system failure.

---

## 6. Translation Pipeline (Conceptual)

The system operates as a deterministic, multi-stage translation pipeline. Each stage has explicit inputs and outputs and may not proceed unless its contract is satisfied.

1. **Free Design (User Interface: Design Input)**
   - The user creates a conceptual design in a free-form 3D environment (e.g. VR-based modeling tools).
   - The output at this stage is a *non-authoritative geometric artifact* (mesh-based), used only as a spatial reference.

2. **Intent Extraction (AI Interpretation Layer)**
   - The AI analyzes the design input to identify:
     - Overall bounding volumes
     - Major partitions and symmetry
     - Component adjacency and hierarchy
   - No fabrication decisions are made at this stage.

3. **Constraint Interview (User Interface: Structured Dialogue)**
   - The AI initiates a structured, goal-oriented interview with the user.
   - The purpose is to resolve all fabrication-critical unknowns.
   - The system must explicitly surface assumptions and require confirmation.

4. **Parametric Specification (Machine-Readable Contract)**
   - The resolved design is expressed as a formal parameter schema.
   - This schema is the authoritative representation of the design intent.

5. **Deterministic Reconstruction (CAD Backend)**
   - A parametric CAD model is generated exclusively from the specification.
   - The original mesh is no longer consulted.

6. **Manufacturing Output (Fabrication Interface)**
   - The CAD model is converted into drawings, cut lists, and fabrication files.

Each step is auditable, reversible, and versioned.

---

## 6. CAD Interoperability and Onshape Input Contract

This section defines the **exact file-level and artifact-level contract** between the system, Onshape, and downstream consumers. It is normative and must be followed by all agents responsible for CAD generation.

### 6.1 Authoritative Control Artifact

The system has exactly **one authoritative control artifact** for geometry generation:

- **PSPEC.json** — the Parametric Specification

PSPEC.json encodes *design intent*, not geometry. It is the single source of truth.

PSPEC.json is **not** imported into Onshape as geometry. Instead, it drives regeneration of a pre-existing parametric template via the Onshape API or FeatureScript variable binding.

### 6.2 Onshape Template Document

The system assumes the existence of a version-controlled Onshape document that contains:
- A fixed cabinet archetype
- Fully constrained sketches
- Named variables for all dimensions and configuration flags
- Optional configurations (e.g. drawers on/off, lid on/off)

This template document is the only geometric source used by Onshape.

### 6.3 Regeneration Mechanism

An AI-controlled CAD agent must:
1. Read PSPEC.json
2. Map PSPEC fields to named Onshape variables
3. Trigger document regeneration via the Onshape API
4. Validate regeneration success

If regeneration fails, the agent must not export partial or invalid geometry.

### 6.4 User-Visible Onshape Artifact

After successful regeneration, the system must provide the user with:
- A **share link** to the regenerated Onshape document (view-only by default)
- A **version identifier** corresponding to the PSPEC revision

The user opens the design in Onshape by following this share link. No file import is required.

### 6.5 Role of STEP, DXF, and PDF (Downstream Only)

The system **must** generate neutral CAD and fabrication formats as *outputs*, not inputs:

- **STEP** — frozen solid geometry for exchange, archiving, CAM, or third-party CAD
- **DXF** — 2D profiles, panel layouts, drilling templates
- **PDF** — dimensioned drawings and assembly documentation

These artifacts are:
- Derived exclusively from the regenerated Onshape model
- Read-only with respect to design intent
- Never re-imported into the system as authoritative sources

Re-importing STEP or DXF files as control inputs is explicitly forbidden, as it destroys parametric intent and violates system determinism.

---

## 7. Role of Onshape

Onshape serves as the authoritative geometric and parametric backend.

Its responsibilities are strictly limited to:
- Solving geometric constraints
- Maintaining parametric consistency
- Exporting industry-standard fabrication formats

Onshape is *not* a user-facing design interface in this system.

The system assumes:
- A fixed template document
- Named configuration variables as the sole control surface
- Regeneration as a deterministic, side-effect-free operation

The user never edits sketches, features, or assemblies directly.

---

## 7. AI Agent Responsibilities

AI agents are specialized, stateful, and contract-bound. No agent may operate outside its defined responsibility.

### 7.1 Intake Agent (User Interface Agent)
- Receives design input files (e.g. meshes)
- Validates file integrity and scale
- Initiates the constraint interview
- Maintains the interaction state with the user

### 7.2 Interpretation Agent (Geometry Reasoning)
- Analyzes non-authoritative geometry
- Extracts bounding boxes, symmetry, and adjacency
- Proposes an initial structural hypothesis

### 7.3 Specification Agent (Authoritative Translator)
- Converts user-confirmed answers into explicit parameters
- Applies defaults where allowed
- Produces a machine-readable specification

### 7.4 CAD Agent (Deterministic Generator)
- Maps the specification to a known CAD template
- Verifies geometric consistency
- Rejects impossible configurations

### 7.5 Manufacturing Agent (Output Formatter)
- Generates drawings using standard conventions
- Produces cut lists and assembly notes
- Adapts outputs to fabrication profiles

---

## 8. Failure Modes (Designed‑For)

The system must explicitly handle:
- Underspecified designs
- Physically impossible layouts
- Conflicting constraints (e.g. drawer depth vs cabinet depth)
- Manufacturing infeasibility

In such cases, the system halts and requests clarification.

---

## 9. Evolution Path

This document defines **V1 philosophy**. Future versions may introduce:
- Additional construction archetypes
- CNC nesting optimization
- Cost estimation
- Supplier‑specific output profiles

All extensions must preserve the separation between intent, parameters, and fabrication.

---

## 10. Definition of Success

The system succeeds if:
- A designer with no CAD knowledge can obtain shop‑ready drawings
- A professional woodshop accepts the outputs without reinterpretation
- The resulting object reflects the original design intent

Failure is any situation where human CAD intervention is required to correct ambiguity.

