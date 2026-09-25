// Whether AI portraits are available. Kept tiny so every function can check
// it without loading the image model code.
//
//   AVATAR_AI=off   switch AI portraits off (uploading finished portraits still works)
//   AVATAR_AI=mock  local testing: skip the AI and hand the photo back
export function aiMode() {
  const mode = (process.env.AVATAR_AI || '').toLowerCase();
  if (mode === 'off' || mode === 'mock') return mode;
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL) return 'on';
  return 'off';
}

// AI portrait goes per team (each go is one image generation). The organiser
// can reset a team's count from the control room.
export function aiLimit() {
  return Math.max(0, Number(process.env.AVATAR_LIMIT || 8));
}
