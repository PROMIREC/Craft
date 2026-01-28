export type PspecV0_1 = {
  pspec_version: "0.1.0";
  project_id: string;
  revision: number;
  created_at: string;
  units: "mm";
  archetype: {
    id: "record_console";
    version: "0.1";
    speaker_enclosure_type: "sealed";
  };
  inputs: {
    crg: {
      original_filename: string;
      format: "glb" | "gltf" | "fbx" | "obj";
      bytes: number;
      sha256: string;
      uploaded_at: string;
    };
    dib: {
      revision: number;
      sha256: string;
      confirmed_at: string;
    };
  };
  overall: { width_mm: number; height_mm: number; depth_mm: number };
  material: { type: string; thickness_mm: number; notes?: string };
  constraints: { back_clearance_mm: number };
  access: { rear_service_hatch: boolean };
  output_profile: "hand_tools" | "panel_saw" | "cnc_shop";
  components: {
    speakers: {
      count: 2;
      enclosure_type: "sealed";
      external_mm: { width_mm: number; height_mm: number; depth_mm: number };
      weight_kg: number;
      clearance_mm: {
        left_mm: number;
        right_mm: number;
        top_mm: number;
        bottom_mm: number;
        front_mm: number;
        rear_mm: number;
      };
      isolation: { strategy: string; notes?: string };
    };
    turntable: {
      external_mm: { width_mm: number; height_mm: number; depth_mm: number };
      isolation: boolean;
      clearance_mm: {
        left_mm: number;
        right_mm: number;
        top_mm: number;
        bottom_mm: number;
        front_mm: number;
        rear_mm: number;
      };
    };
    amplifier: {
      external_mm: { width_mm: number; height_mm: number; depth_mm: number };
      ventilation_direction: "front" | "rear" | "up" | "left" | "right";
      clearance_mm: {
        left_mm: number;
        right_mm: number;
        top_mm: number;
        bottom_mm: number;
        front_mm: number;
        rear_mm: number;
      };
    };
    drawers: {
      count: number;
      lp_capacity_target: number;
    };
  };
  notes?: string;
};

