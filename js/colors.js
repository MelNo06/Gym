// The app's colour system: 12 fixed colours, each in five fixed shades.
// A muscle group picks one of the 12 colours. A gym picks a shade level. A line in a graph is then
// "the exercise's muscle colour, in the gym's shade". Everything that does not depend on a gym uses
// the middle shade (index 2). Shades run from very light (index 0) to very dark (index 4).
export const PALETTE = {
  red: ["#fdc9c4", "#fd948c", "#f4514f", "#c53a3a", "#9d2d2d"],
  orange: ["#ffd2b8", "#feac7a", "#f58028", "#c86617", "#994a06"],
  yellow: ["#f9e5a9", "#f3d36f", "#e9c025", "#c39f19", "#9a7d11"],
  lime: ["#d6f0aa", "#bce371", "#a2d128", "#85ae1a", "#678810"],
  green: ["#b0efbc", "#74dc8e", "#20c45f", "#099f4a", "#037835"],
  teal: ["#adece0", "#6ed8c7", "#16beaa", "#159989", "#067367"],
  cyan: ["#afeafd", "#73d5f3", "#1ebde3", "#089aba", "#0b758d"],
  blue: ["#bfdafd", "#86b9fd", "#4392f7", "#2f72c8", "#245a9f"],
  indigo: ["#ced1fe", "#a6a8fd", "#7e79f5", "#625cc5", "#514da2"],
  violet: ["#e3cffd", "#cea3fe", "#b376f0", "#8f5cc3", "#6d4396"],
  magenta: ["#ffc4f0", "#f691e1", "#df5fc8", "#b447a1", "#8a327b"],
  pink: ["#fed7de", "#ffb7c6", "#fc93ac", "#d1778d", "#a35b6d"],
};
/** Grey in the same five shades: exercises without a muscle group, and gym markers outside a graph. */
export const NEUTRAL = ["#e4e8ed", "#bec5cc", "#979fa8", "#757d85", "#585e65"];
export const COLOR_KEYS = Object.keys(PALETTE);

/** Shade levels a gym can have, as [level, label]. The first free one is offered to a new gym. */
export const SHADES = [[0, 'Normal'], [1, 'Light'], [-1, 'Dark'], [2, 'Very light'], [-2, 'Very dark']];
export const shadeName = level => (SHADES.find(([v]) => v === (level || 0)) || SHADES[0])[1];

/** Colour `key` at a shade level from +2 (very light) to -2 (very dark). Grey when the key is unknown. */
export const shade = (key, level = 0) => (PALETTE[key] || NEUTRAL)[2 - Math.max(-2, Math.min(2, level || 0))];
