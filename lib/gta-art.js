// Turns a photo into a GTA cover art style portrait with Google's
// Nano Banana image models (the same family the poster was made with), called
// through Vercel AI Gateway. On Vercel the gateway signs in with the project's
// OIDC token automatically; elsewhere set AI_GATEWAY_API_KEY.
//
//   AVATAR_MODEL  override the model, e.g. google/gemini-3.1-flash-image (faster, cheaper)

import { aiMode } from './ai-mode.js';

// Nano Banana Pro first for the best likeness and style, then Nano Banana 2
// and the original Nano Banana as fallbacks.
const DEFAULT_MODELS = ['google/gemini-3-pro-image', 'google/gemini-3.1-flash-image', 'google/gemini-2.5-flash-image'];

// Models that answer through generateText (image parts in result.files).
const isLanguageImageModel = (id) => /^google\/gemini-.*image/.test(id);

// Written the way the poster prompt was: short and direct. The poster was
// made with "a GTA cover art style poster ... I want everything in the GTA
// art style", so the portraits ask for the same thing.
export function prompt(kind) {
  const duo = kind === 'duo';
  return [
    duo
      ? 'Make a GTA cover art style portrait of the two people in the first photo, together in one panel.'
      : 'Make a GTA cover art style portrait of the person in the first photo.',
    'I want everything in the GTA art style, matching the second image. It shows panels from our party poster.',
    'Only use the second image for the art style. Do not copy the people in it.',
    duo
      ? 'Keep them both looking exactly like themselves, so their mates recognise them straight away.'
      : 'Keep them looking exactly like themselves, so their mates recognise them straight away.',
    duo
      ? 'Side by side from the chest up. Square image, with flames in the background like the poster panels.'
      : 'Head and shoulders, facing the camera. Square image, with flames in the background like the poster panels.',
    'No text, logos or weapons.',
  ].join('\n');
}

function friendlyError(err) {
  const text = `${err?.message || ''} ${err?.responseBody || ''}`.toLowerCase();
  if (text.includes('oidc') || text.includes('api key') || text.includes('unauthorized') || text.includes('authentication')) {
    return 'AI portraits aren’t connected on Vercel yet. The organiser can switch them on (see the README). In the meantime you can upload a finished portrait instead.';
  }
  if (text.includes('credit') || text.includes('insufficient') || text.includes('payment') || text.includes('402') || text.includes('quota')) {
    return 'The Vercel AI credit has run out. The organiser can top it up in the Vercel dashboard.';
  }
  if (text.includes('safety') || text.includes('blocked') || text.includes('policy') || text.includes('prohibited')) {
    return 'The AI refused that photo. Try a different one: a clear, well-lit photo of faces works best.';
  }
  if (text.includes('timeout') || text.includes('aborted')) {
    return 'The AI took too long. Give it another go.';
  }
  return 'The AI couldn’t draw that one. Try again, or use a different photo.';
}

// Returns { data: Uint8Array, mediaType, model }.
export async function gtaify({ photo, mediaType = 'image/jpeg', kind = 'solo' }) {
  const mode = aiMode();
  if (mode === 'mock') {
    const wait = Number(process.env.AVATAR_MOCK_DELAY || 0);
    if (wait) await new Promise((r) => setTimeout(r, Math.min(wait, 20_000)));
    return { data: new Uint8Array(photo), mediaType, model: 'mock' };
  }
  if (mode === 'off') {
    const err = new Error('AI portraits are switched off.');
    err.friendly = 'AI portraits aren’t switched on for this portal. You can upload a finished portrait instead.';
    throw err;
  }

  const { generateText, generateImage } = await import('ai');
  const { STYLE_REF_JPEG } = await import('./style-ref.js');
  const style = new Uint8Array(Buffer.from(STYLE_REF_JPEG, 'base64'));
  const models = process.env.AVATAR_MODEL ? [process.env.AVATAR_MODEL] : DEFAULT_MODELS;
  const deadline = Date.now() + 130_000;
  let lastError = null;

  for (const model of models) {
    const left = Math.min(100_000, deadline - Date.now());
    if (left < 20_000) break;
    try {
      if (isLanguageImageModel(model)) {
        const imageConfig = { aspectRatio: '1:1', imageSize: '1K' };
        const result = await generateText({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt(kind) },
                { type: 'text', text: 'First photo:' },
                { type: 'file', mediaType, data: new Uint8Array(photo) },
                { type: 'text', text: 'Second image, for the art style only:' },
                { type: 'file', mediaType: 'image/jpeg', data: style },
              ],
            },
          ],
          providerOptions: {
            google: { responseModalities: ['TEXT', 'IMAGE'], imageConfig },
            vertex: { responseModalities: ['TEXT', 'IMAGE'], imageConfig },
          },
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(left),
        });
        const image = result.files?.find((f) => f.mediaType?.startsWith('image/'));
        if (image) return { data: image.uint8Array, mediaType: image.mediaType, model };
        lastError = new Error(`No image returned. ${result.text || ''}`.trim());
      } else {
        const { images } = await generateImage({
          model,
          prompt: { images: [new Uint8Array(photo), style], text: prompt(kind) },
          aspectRatio: '1:1',
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(left),
        });
        if (images?.[0]) return { data: images[0].uint8Array, mediaType: images[0].mediaType || 'image/png', model };
        lastError = new Error('No image returned.');
      }
    } catch (err) {
      console.error(`Avatar generation failed with ${model}:`, err?.message || err);
      lastError = err;
      // Sign-in and credit problems won't be fixed by trying another model.
      if (/oidc|api key|unauthori|authentication|credit|insufficient|payment|402/i.test(`${err?.message} ${err?.responseBody || ''}`)) break;
    }
  }
  const err = new Error(lastError?.message || 'Generation failed');
  err.friendly = friendlyError(lastError);
  throw err;
}
