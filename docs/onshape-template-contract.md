# Onshape Template Contract (V0.1) — Craft “Prep for Onshape”

## Purpose
This document defines the **canonical variable interface** between Craft and a **version-controlled Onshape template document** for the `record_console` archetype.

Craft **does not import geometry** into Onshape. Instead, Craft produces a deterministic **flat variable map** that an Onshape agent (Phase 2+) will use to set template variables and regenerate the model.

This contract is **normative** for the Craft codebase and must remain consistent with:
- `docs/architecture.md` (Onshape contract + determinism)
- `docs/pspec.md` (PSPEC authority + lineage)
- `schemas/pspec.schema.json` (authoritative PSPEC schema)

## Template assumptions
The Onshape template document must:
- Contain a fixed `record_console` archetype (fully constrained sketches/features).
- Expose **named variables** matching this contract (case-sensitive).
- Treat all dimensional variables as **millimeters** when applied.
- Use configuration/feature logic driven by the variables below (e.g., drawer count, rear hatch on/off).

## Variable naming rules
- **Uppercase snake case** only: `^[A-Z][A-Z0-9_]*$`
- Stable subsystem prefixes:
  - `OVERALL_*`
  - `MAT_*`
  - `SPK_L_*` and `SPK_R_*`
  - `TURNTABLE_*`
  - `AMP_*`
  - `DRAWER_*`
  - `ACCESS_*`
- All variables are **scalar** (no arrays/objects).

## Units and rounding policy
### Dimensions
- All dimensional values are represented as **integers in millimeters** in the variables map.
- Rounding: **nearest integer** via `round(x)` (equivalent to JS `Math.round`).

### Flags and counts
- Boolean flags are encoded as integers:
  - `0` = false
  - `1` = true
- Counts are encoded as non-negative integers.

## Manufacturing profiles and mapping
In `pspec_version = 0.1.0`, `output_profile` affects downstream manufacturing outputs, **not** the Onshape template geometry. Therefore:
- The Onshape variable mapping is **profile-agnostic** in V0.1.
- No `PROFILE_*` variables are produced in this phase.

If a future template requires profile-dependent geometry, a new contract version must explicitly introduce `PROFILE_*` variables and a deterministic selection policy.

## Required variables
All required variables must be present in the generated variables map, or mapping fails (no partial output).

| Variable | Type | Unit | Range / constraints | Notes |
|---|---:|---|---|---|
| `OVERALL_W` | int | mm | 1…10000 | Cabinet outer width |
| `OVERALL_H` | int | mm | 1…10000 | Cabinet outer height |
| `OVERALL_D` | int | mm | 1…10000 | Cabinet outer depth |
| `OVERALL_BACK_CLEARANCE` | int | mm | 0…2000 | Reserved rear clearance for cables/airflow |
| `OVERALL_AVAILABLE_DEPTH` | int | mm | must be `OVERALL_D - OVERALL_BACK_CLEARANCE` and > 0 | Derived convenience variable |
| `MAT_THICKNESS` | int | mm | 1…2000 | Sheet-goods thickness |
| `SPK_L_W` | int | mm | 1…10000 | Speaker external width |
| `SPK_L_H` | int | mm | 1…10000 | Speaker external height |
| `SPK_L_D` | int | mm | 1…10000 | Speaker external depth |
| `SPK_L_CLR_L` | int | mm | 0…2000 | Speaker clearance (left) |
| `SPK_L_CLR_R` | int | mm | 0…2000 | Speaker clearance (right) |
| `SPK_L_CLR_T` | int | mm | 0…2000 | Speaker clearance (top) |
| `SPK_L_CLR_B` | int | mm | 0…2000 | Speaker clearance (bottom) |
| `SPK_L_CLR_F` | int | mm | 0…2000 | Speaker clearance (front) |
| `SPK_L_CLR_REAR` | int | mm | 0…2000 | Speaker clearance (rear) |
| `SPK_R_W` | int | mm | 1…10000 | Same as left in PSPEC v0.1 |
| `SPK_R_H` | int | mm | 1…10000 | Same as left in PSPEC v0.1 |
| `SPK_R_D` | int | mm | 1…10000 | Same as left in PSPEC v0.1 |
| `SPK_R_CLR_L` | int | mm | 0…2000 | Same as left in PSPEC v0.1 |
| `SPK_R_CLR_R` | int | mm | 0…2000 | Same as left in PSPEC v0.1 |
| `SPK_R_CLR_T` | int | mm | 0…2000 | Same as left in PSPEC v0.1 |
| `SPK_R_CLR_B` | int | mm | 0…2000 | Same as left in PSPEC v0.1 |
| `SPK_R_CLR_F` | int | mm | 0…2000 | Same as left in PSPEC v0.1 |
| `SPK_R_CLR_REAR` | int | mm | 0…2000 | Same as left in PSPEC v0.1 |
| `TURNTABLE_W` | int | mm | 1…10000 | Turntable external width |
| `TURNTABLE_H` | int | mm | 1…10000 | Turntable external height |
| `TURNTABLE_D` | int | mm | 1…10000 | Turntable external depth |
| `TURNTABLE_CLR_L` | int | mm | 0…2000 | V0.1 default = 0 |
| `TURNTABLE_CLR_R` | int | mm | 0…2000 | V0.1 default = 0 |
| `TURNTABLE_CLR_T` | int | mm | 0…2000 | V0.1 default = 0 |
| `TURNTABLE_CLR_B` | int | mm | 0…2000 | V0.1 default = 0 |
| `TURNTABLE_CLR_F` | int | mm | 0…2000 | V0.1 default = 0 |
| `TURNTABLE_CLR_REAR` | int | mm | 0…2000 | V0.1 default = 0 |
| `AMP_W` | int | mm | 1…10000 | Amplifier external width |
| `AMP_H` | int | mm | 1…10000 | Amplifier external height |
| `AMP_D` | int | mm | 1…10000 | Amplifier external depth |
| `AMP_CLR_L` | int | mm | 0…2000 | Amplifier clearance (left) |
| `AMP_CLR_R` | int | mm | 0…2000 | Amplifier clearance (right) |
| `AMP_CLR_T` | int | mm | 0…2000 | Amplifier clearance (top) |
| `AMP_CLR_B` | int | mm | 0…2000 | Amplifier clearance (bottom) |
| `AMP_CLR_F` | int | mm | 0…2000 | Amplifier clearance (front) |
| `AMP_CLR_REAR` | int | mm | 0…2000 | Amplifier clearance (rear) |
| `DRAWER_COUNT` | int | count | 0…6 | Drawer count |
| `DRAWER_LP_CAP_TARGET` | int | count | 0…3000 | Target LP capacity |
| `ACCESS_REAR_SERVICE_HATCH` | int | flag | 0/1 | Rear service hatch enable |

## Optional variables
Optional variables may be omitted by the template; Craft may still emit them when available.

| Variable | Type | Unit | Notes |
|---|---:|---|---|
| `MAT_TYPE_CODE` | int | enum | `0=plywood, 1=mdf, 2=veneer_plywood, 3=other` |
| `AMP_VENT_DIR_CODE` | int | enum | `0=front, 1=rear, 2=up, 3=left, 4=right` |

## Mapping table (PSPEC → Onshape variable)
PSPEC fields are referenced as JSON Pointers.

| Onshape variable | PSPEC pointer(s) | Source | Notes |
|---|---|---|---|
| `OVERALL_W` | `/overall/width_mm` | DIB | Rounded to integer mm |
| `OVERALL_H` | `/overall/height_mm` | DIB | Rounded to integer mm |
| `OVERALL_D` | `/overall/depth_mm` | DIB | Rounded to integer mm |
| `OVERALL_BACK_CLEARANCE` | `/constraints/back_clearance_mm` | DIB/DEFAULT | Rounded to integer mm |
| `OVERALL_AVAILABLE_DEPTH` | `/overall/depth_mm`, `/constraints/back_clearance_mm` | DERIVED | `round(depth - back_clearance)` |
| `MAT_THICKNESS` | `/material/thickness_mm` | DIB/DEFAULT | Rounded to integer mm |
| `MAT_TYPE_CODE` | `/material/type` | DIB/DEFAULT | Enum code mapping per Optional table |
| `SPK_*_W/H/D` | `/components/speakers/external_mm/*` | DIB | L/R are identical in PSPEC v0.1 |
| `SPK_*_CLR_*` | `/components/speakers/clearance_mm/*` | DERIVED | In PSPEC v0.1, all sides are set from DIB `required_clearance_mm` |
| `TURNTABLE_*_W/H/D` | `/components/turntable/external_mm/*` | DIB | Rounded to integer mm |
| `TURNTABLE_*_CLR_*` | `/components/turntable/clearance_mm/*` | DEFAULT | In PSPEC v0.1 these are always `0` |
| `AMP_W/H/D` | `/components/amplifier/external_mm/*` | DIB | Rounded to integer mm |
| `AMP_CLR_*` | `/components/amplifier/clearance_mm/*` | DERIVED | In PSPEC v0.1, all sides are set from DIB `required_clearance_mm` |
| `AMP_VENT_DIR_CODE` | `/components/amplifier/ventilation_direction` | DIB/DEFAULT | Enum code mapping per Optional table |
| `DRAWER_COUNT` | `/components/drawers/count` | DIB/DEFAULT | Integer |
| `DRAWER_LP_CAP_TARGET` | `/components/drawers/lp_capacity_target` | DIB/DEFAULT | Integer |
| `ACCESS_REAR_SERVICE_HATCH` | `/access/rear_service_hatch` | DIB/DEFAULT | `true→1`, `false→0` |

## Error policy
Mapping generation is **fail-fast** and **all-or-nothing**:
- Missing required PSPEC fields for required variables → error; do not write any mapping output.
- Invalid type/value (NaN/Infinity, non-integer counts, invalid enum) → error.
- Out-of-range values → error (do not clamp).

Errors must identify:
- Onshape variable name
- PSPEC pointer (when applicable)
- A human-readable message

## Versioning
Contract identifier: **`onshape_template_contract_version = 0.1.0`**

Any change to:
- variable names,
- rounding policy,
- units,
- required/optional sets, or
- enum code mappings

must bump the contract version and update both:
- this document, and
- `schemas/onshape.variables.schema.json`.

