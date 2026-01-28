export type DibQuestionKind = "confirm" | "boolean" | "enum" | "number_mm" | "number" | "integer" | "text";

export type DibDependsOn =
  | { path: string; equals: unknown }
  | { path: string; gte: number };

export type DibQuestion = {
  id: string;
  group: string;
  kind: DibQuestionKind;
  prompt: string;
  store_path: string;
  required: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  options?: string[];
  depends_on?: DibDependsOn;
  confirm_if_default?: boolean;
};

export type DibQuestionSet = {
  question_set_version: "0.1.0";
  dib_version: "0.1.0";
  archetype_id: "record_console";
  defaults: {
    units: "mm";
    material: { type: "plywood"; thickness_mm: 18 };
    drawers: { count: 2 };
    constraints: { back_clearance_mm: 25 };
    assumptions: {
      speaker_enclosure_type: "sealed";
      archetype_layout: "two_record_drawers + central_electronics + left/right_speaker_bays";
    };
  };
  questions: DibQuestion[];
};

export const dibQuestionSetV0_1: DibQuestionSet = {
  question_set_version: "0.1.0",
  dib_version: "0.1.0",
  archetype_id: "record_console",
  defaults: {
    units: "mm",
    material: { type: "plywood", thickness_mm: 18 },
    drawers: { count: 2 },
    constraints: { back_clearance_mm: 25 },
    assumptions: {
      speaker_enclosure_type: "sealed",
      archetype_layout: "two_record_drawers + central_electronics + left/right_speaker_bays"
    }
  },
  questions: [
    {
      id: "assumptions.confirm_archetype",
      group: "assumptions",
      kind: "confirm",
      prompt:
        "This project uses the 'record console' archetype (left/right speaker bays, central electronics bay, record drawers). Continue?",
      store_path: "/assumptions/archetype_confirmed",
      required: true
    },
    {
      id: "assumptions.confirm_sealed_speakers",
      group: "assumptions",
      kind: "confirm",
      prompt: "Speakers are treated as sealed-only (no ported enclosure design). Confirm?",
      store_path: "/assumptions/sealed_speakers_confirmed",
      required: true
    },

    {
      id: "overall.width_mm",
      group: "overall",
      kind: "number_mm",
      prompt: "Overall cabinet width (mm)?",
      store_path: "/overall/width_mm",
      required: true,
      min: 1,
      max: 10000
    },
    {
      id: "overall.height_mm",
      group: "overall",
      kind: "number_mm",
      prompt: "Overall cabinet height (mm)?",
      store_path: "/overall/height_mm",
      required: true,
      min: 1,
      max: 10000
    },
    {
      id: "overall.depth_mm",
      group: "overall",
      kind: "number_mm",
      prompt: "Overall cabinet depth (mm)?",
      store_path: "/overall/depth_mm",
      required: true,
      min: 1,
      max: 10000
    },

    {
      id: "constraints.back_clearance_mm",
      group: "constraints",
      kind: "number_mm",
      prompt: "Rear clearance for cables/airflow (mm)?",
      store_path: "/constraints/back_clearance_mm",
      required: true,
      default: 25,
      min: 0,
      max: 2000,
      confirm_if_default: true
    },

    {
      id: "access.rear_service_hatch",
      group: "access",
      kind: "boolean",
      prompt: "Rear service hatch for access/maintenance?",
      store_path: "/access/rear_service_hatch",
      required: true
    },

    {
      id: "material.type",
      group: "material",
      kind: "enum",
      prompt: "Material type?",
      store_path: "/material/type",
      required: true,
      default: "plywood",
      options: ["plywood", "mdf", "veneer_plywood", "other"],
      confirm_if_default: true
    },
    {
      id: "material.thickness_mm",
      group: "material",
      kind: "number_mm",
      prompt: "Material thickness (mm)?",
      store_path: "/material/thickness_mm",
      required: true,
      default: 18,
      min: 1,
      max: 2000,
      confirm_if_default: true
    },
    {
      id: "material.notes",
      group: "material",
      kind: "text",
      prompt: "If material is 'other', describe it briefly (optional otherwise).",
      store_path: "/material/notes",
      required: false,
      depends_on: { path: "/material/type", equals: "other" }
    },

    {
      id: "speakers.external.width_mm",
      group: "speakers",
      kind: "number_mm",
      prompt: "Speaker external width (mm)?",
      store_path: "/speakers/external_mm/width_mm",
      required: true,
      min: 1,
      max: 10000
    },
    {
      id: "speakers.external.height_mm",
      group: "speakers",
      kind: "number_mm",
      prompt: "Speaker external height (mm)?",
      store_path: "/speakers/external_mm/height_mm",
      required: true,
      min: 1,
      max: 10000
    },
    {
      id: "speakers.external.depth_mm",
      group: "speakers",
      kind: "number_mm",
      prompt: "Speaker external depth (mm)?",
      store_path: "/speakers/external_mm/depth_mm",
      required: true,
      min: 1,
      max: 10000
    },
    {
      id: "speakers.weight_kg",
      group: "speakers",
      kind: "number",
      prompt: "Single-speaker weight (kg)?",
      store_path: "/speakers/weight_kg",
      required: true,
      min: 0.01,
      max: 500
    },
    {
      id: "speakers.required_clearance_mm",
      group: "speakers",
      kind: "number_mm",
      prompt:
        "Required clearance around each speaker (mm) (applies to all sides unless you specify otherwise later)?",
      store_path: "/speakers/required_clearance_mm",
      required: true,
      min: 0,
      max: 2000
    },
    {
      id: "speakers.isolation.strategy",
      group: "speakers",
      kind: "enum",
      prompt: "Speaker isolation strategy?",
      store_path: "/speakers/isolation/strategy",
      required: true,
      options: ["none", "foam_pad", "sorbothane_feet", "spikes", "floating_shelf", "other"]
    },
    {
      id: "speakers.isolation.notes",
      group: "speakers",
      kind: "text",
      prompt: "If isolation is 'other', describe it briefly (optional otherwise).",
      store_path: "/speakers/isolation/notes",
      required: false,
      depends_on: { path: "/speakers/isolation/strategy", equals: "other" }
    },

    {
      id: "turntable.external.width_mm",
      group: "turntable",
      kind: "number_mm",
      prompt: "Turntable external width (mm)?",
      store_path: "/turntable/external_mm/width_mm",
      required: true,
      min: 1,
      max: 10000
    },
    {
      id: "turntable.external.height_mm",
      group: "turntable",
      kind: "number_mm",
      prompt: "Turntable external height (mm)?",
      store_path: "/turntable/external_mm/height_mm",
      required: true,
      min: 1,
      max: 10000
    },
    {
      id: "turntable.external.depth_mm",
      group: "turntable",
      kind: "number_mm",
      prompt: "Turntable external depth (mm)?",
      store_path: "/turntable/external_mm/depth_mm",
      required: true,
      min: 1,
      max: 10000
    },
    {
      id: "turntable.isolation",
      group: "turntable",
      kind: "boolean",
      prompt: "Turntable isolation required?",
      store_path: "/turntable/isolation",
      required: true
    },

    {
      id: "amplifier.external.width_mm",
      group: "amplifier",
      kind: "number_mm",
      prompt: "Amplifier external width (mm)?",
      store_path: "/amplifier/external_mm/width_mm",
      required: true,
      min: 1,
      max: 10000
    },
    {
      id: "amplifier.external.height_mm",
      group: "amplifier",
      kind: "number_mm",
      prompt: "Amplifier external height (mm)?",
      store_path: "/amplifier/external_mm/height_mm",
      required: true,
      min: 1,
      max: 10000
    },
    {
      id: "amplifier.external.depth_mm",
      group: "amplifier",
      kind: "number_mm",
      prompt: "Amplifier external depth (mm)?",
      store_path: "/amplifier/external_mm/depth_mm",
      required: true,
      min: 1,
      max: 10000
    },
    {
      id: "amplifier.ventilation_direction",
      group: "amplifier",
      kind: "enum",
      prompt: "Amplifier ventilation direction?",
      store_path: "/amplifier/ventilation_direction",
      required: true,
      options: ["front", "rear", "up", "left", "right"]
    },
    {
      id: "amplifier.required_clearance_mm",
      group: "amplifier",
      kind: "number_mm",
      prompt:
        "Required clearance around amplifier for cables/airflow (mm) (applies to all sides unless you specify otherwise later)?",
      store_path: "/amplifier/required_clearance_mm",
      required: true,
      min: 0,
      max: 2000
    },

    {
      id: "drawers.count",
      group: "drawers",
      kind: "integer",
      prompt: "How many record drawers?",
      store_path: "/drawers/count",
      required: true,
      default: 2,
      min: 0,
      max: 6,
      confirm_if_default: true
    },
    {
      id: "drawers.lp_capacity_target",
      group: "drawers",
      kind: "integer",
      prompt: "LP capacity target (total records)?",
      store_path: "/drawers/lp_capacity_target",
      required: true,
      min: 0,
      max: 3000,
      depends_on: { path: "/drawers/count", gte: 1 }
    },

    {
      id: "output_profile",
      group: "output",
      kind: "enum",
      prompt: "Output profile?",
      store_path: "/output_profile",
      required: true,
      options: ["hand_tools", "panel_saw", "cnc_shop"]
    },

    {
      id: "confirm_dib_authoritative",
      group: "confirmation",
      kind: "confirm",
      prompt:
        "Confirm these answers as authoritative (this will lock the DIB revision used to generate PSPEC)?",
      store_path: "/confirmed",
      required: true
    }
  ]
};

