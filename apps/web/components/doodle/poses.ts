import type { Pose } from "./skeleton";

export type Who = "scout" | "inspector" | "notary" | "guard" | "gremlin";

const idle: Pose = {
  armL: [30, -14],
  armR: [-30, 14],
  legL: [7, 0],
  legR: [-7, 0],
};
/** "q" is the design's three-quarter view: weight on one leg, arms loose. */
const q: Pose = {
  torso: 3,
  head: 6,
  armL: [8, -22],
  armR: [-24, 34],
  legL: [3, 2],
  legR: [-11, 6],
};

const stamp1: Pose = {
  torso: -4,
  armL: [18, -20],
  armR: [-165, -10],
  legL: [8, 0],
  legR: [-8, 0],
  ms: 160,
};
const stamp2: Pose = {
  torso: 8,
  armL: [22, -20],
  armR: [-55, -35],
  legL: [8, 0],
  legR: [-8, 0],
  ms: 110,
};
const stamp3: Pose = {
  torso: 2,
  armL: [18, -20],
  armR: [-115, -40],
  legL: [8, 0],
  legR: [-8, 0],
  ms: 160,
};

const run1: Pose = {
  hip: [32, 58],
  torso: 12,
  armL: [-45, -80],
  armR: [38, -50],
  legL: [-48, 72],
  legR: [32, 42],
  ms: 90,
};
const run2: Pose = {
  hip: [32, 60],
  torso: 12,
  armL: [-10, -65],
  armR: [6, -65],
  legL: [-10, 95],
  legR: [6, 22],
  ms: 90,
};
const run3: Pose = {
  hip: [32, 58],
  torso: 12,
  armL: [38, -50],
  armR: [-45, -80],
  legL: [32, 42],
  legR: [-48, 72],
  ms: 90,
};
const run4: Pose = {
  hip: [32, 60],
  torso: 12,
  armL: [6, -65],
  armR: [-10, -65],
  legL: [6, 22],
  legR: [-10, 95],
  ms: 90,
};

const pull = (i: 0 | 1 | 2): Pose => ({
  hip: [32, 64 + i * 6],
  torso: 0,
  armL: [168 - i * 16, 8 + i * 30],
  armR: [-168 + i * 16, -8 - i * 30],
  legL: [4 - i * 14, 8 + i * 30],
  legR: [-4 + i * 14, -8 - i * 30],
  handL: null,
  handR: null,
  scene: "ropeAbove",
  ms: 140,
});

/** Pose data per figure, keyed as in the design (`scout_run1`, …). */
export const POSES: Record<Who, { idle: Pose } & Record<string, Pose>> = {
  scout: {
    idle,
    q,
    run1,
    run2,
    run3,
    run4,
    pull1: pull(0),
    pull2: pull(1),
    pull3: pull(2),
    sit: {
      hip: [30, 66],
      torso: -4,
      armL: [-35, -40],
      armR: [-25, -45],
      legL: [-82, 84],
      legR: [-74, 78],
      scene: "basketBelow",
    },
    map: {
      head: 10,
      armL: [22, -118],
      armR: [-22, 118],
      legL: [7, 0],
      legR: [-7, 0],
      handL: null,
      handR: "map",
    },
    tangled: {
      torso: 14,
      head: -12,
      armL: [62, -118],
      armR: [-104, 84],
      legL: [-14, 6],
      legR: [16, -4],
      scene: "tangle",
    },
  },
  inspector: {
    idle,
    q,
    stamp1: { ...stamp1, handR: "stamp" },
    stamp2: { ...stamp2, handR: "stamp" },
    stamp3: { ...stamp3, handR: "stamp" },
    thumbs: { ...idle, armR: [-72, -100], handR: "thumb" },
  },
  notary: { idle, q, stamp1, stamp2, stamp3 },
  guard: {
    // The sign rests beside the Guard, never over its face.
    idle: { ...idle, armR: [-70, 10] },
    q: { ...q, armR: [-66, 12] },
    block: {
      torso: -3,
      armL: [30, -60],
      armR: [-92, 4],
      legL: [13, 0],
      legR: [-13, 0],
      ms: 220,
    },
  },
  gremlin: {
    idle,
    q,
    swap: {
      torso: 10,
      armL: [-70, -30],
      armR: [-86, -10],
      legL: [10, 0],
      legR: [-18, 10],
    },
    edit: {
      torso: 6,
      armL: [-30, -70],
      armR: [-50, -80],
      legL: [8, 0],
      legR: [-10, 4],
      handR: "pencil",
    },
  },
};

/** Pose names per figure, in the design's order. */
export const POSE_KEYS: Record<Who | "pair", string[]> = {
  scout: [
    "idle",
    "q",
    "run1",
    "run2",
    "run3",
    "run4",
    "pull1",
    "pull2",
    "pull3",
    "sit",
    "map",
    "tangled",
  ],
  inspector: ["idle", "q", "stamp1", "stamp2", "stamp3", "thumbs"],
  notary: ["idle", "q", "stamp1", "stamp2", "stamp3"],
  guard: ["idle", "q", "block"],
  gremlin: ["idle", "q", "swap", "edit"],
  pair: ["ready", "highfive"],
};

/** The pair side by side before the high-five. */
export const PAIR_READY: { scout: Pose; inspector: Pose } = {
  scout: {
    armL: [26, -14],
    armR: [-26, 14],
    legL: [8, 0],
    legR: [-6, 0],
    ms: 220,
  },
  inspector: {
    armL: [26, -14],
    armR: [-26, 14],
    legL: [6, 0],
    legR: [-8, 0],
    ms: 220,
  },
};

/** Hands meet between the two figures (drawn 40 px apart in the pair box). */
export const HIGHFIVE: { scout: Pose; inspector: Pose } = {
  scout: {
    torso: 4,
    armL: [26, -16],
    armR: [-125, 4],
    legL: [10, 0],
    legR: [-4, 0],
    ms: 220,
  },
  inspector: {
    torso: -4,
    armL: [125, -4],
    armR: [-26, 16],
    legL: [4, 0],
    legR: [-10, 0],
    ms: 220,
  },
};
