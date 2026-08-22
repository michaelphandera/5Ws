// Deep link into Google Earth web, flying to a point.
// `eyeAltM` is the eye altitude in metres: ~600 frames a single office site
// (buildings, roads); use a few thousand to frame a whole district.
export const googleEarthUrl = (lat, lng, eyeAltM = 600) =>
  `https://earth.google.com/web/@${lat},${lng},0a,${eyeAltM}d,35y,0h,0t,0r`;

// Sensible framing per admin level (1 = island group … 3 = sub-district).
export const eyeAltForLevel = (level) => ({ 1: 30000, 2: 8000, 3: 2500 }[level] || 8000);
