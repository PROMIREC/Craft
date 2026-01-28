# PSPEC.json — Parametric Specification (v0.1.0)

PSPEC is the **single source of truth** for downstream CAD generation.

## Authority model
- **CRG** (Concept Reference Geometry) is *non-authoritative* and must never be used to infer manufacturable dimensions.
- **DIB** (Design Intent Brief) becomes *authoritative* once confirmed by the user.
- **PSPEC** is synthesized from CRG metadata + confirmed DIB and validated against `schemas/pspec.schema.json`.

## Units
- All dimensional values are millimeters (`mm`).
- Mass is kilograms (`kg`).

## Versioning
- `pspec_version` is the schema contract version (currently `0.1.0`).
- `revision` increments per generated PSPEC revision within a `project_id`.
- Approved PSPEC revisions are immutable (approval locks a specific revision).

## File lineage (deterministic)
For each project run, these artifacts must be written:
```
artifacts/<project_id>/crg/<original_filename>
artifacts/<project_id>/dib/dib.json
artifacts/<project_id>/pspec/pspec.json
artifacts/<project_id>/pspec/pspec.summary.md
artifacts/<project_id>/meta/run.json
```

Additional versioned copies may be stored (e.g. `rev-0001/`) but the above paths must always exist for the latest run.

## Core sections (v0.1.0)
- `inputs.crg`: file metadata only (no geometry inference).
- `inputs.dib`: hash + revision pointer to the authoritative DIB used.
- `overall`: cabinet outer bounding box target.
- `material`: sheet good type and thickness.
- `constraints.back_clearance_mm`: reserved depth for cables/airflow (do not infer from CRG).
- `components`: black-box objects (speakers/turntable/amplifier/drawers) with explicit dimensions and clearances.
- `output_profile`: fabrication profile (`hand_tools`, `panel_saw`, `cnc_shop`).

See `schemas/pspec.schema.json` for the authoritative contract.

