// Turns a photo into a GTA loading-screen style portrait with an image model
// on Vercel AI Gateway. On Vercel the gateway signs in with the project's
// OIDC token automatically; elsewhere set AI_GATEWAY_API_KEY.
//
//   AVATAR_MODEL  override the model, e.g. google/gemini-3-pro-image or openai/gpt-image-2

import { aiMode } from './ai-mode.js';

const DEFAULT_MODELS = ['google/gemini-3.1-flash-image', 'google/gemini-2.5-flash-image'];

// Models that answer through generateText (image parts in result.files).
const isLanguageImageModel = (id) => /^google\/gemini-.*image/.test(id);

const RULES = [
  'Copy the art style of the reference panels exactly: thick black ink outlines, cel shading, bold saturated comic-book colours, gritty texture, subtle halftone dots and dramatic lighting, like a Grand Theft Auto loading-screen illustration.',
  'Keep every person clearly recognisable: same face shape, skin tone, hairstyle, facial hair, glasses and expression. Do not make anyone look older, younger or thinner.',
  'Background: a single flat comic panel colour with stylised orange flames behind them, like the reference.',
  'No text, lettering, logos, watermarks, speech bubbles, borders or weapons. One square image only.',
];

function prompt(kind) {
  if (kind === 'duo') {
    return [
      'The first image is a photo of two friends. The second image shows reference panels from our party poster.',
      'Redraw both friends from the photo together in one square comic panel, side by side from the chest up, looking at the viewer with attitude.',
      ...RULES,
    ].join('\n');
  }
  return [
    'The first image is a photo of a person. The second image shows reference panels from our party poster.',
    'Redraw the person from the photo as a new head-and-shoulders character portrait, centred, looking at the viewer with attitude.',
    ...RULES,
  ].join('\n');
}

function friendlyError(err) {
  const text = `${err?.message || ''} ${err?.responseBody || ''}`.toLowerCase();
  if (text.includes('oidc') || text.includes('api key') || text.includes('unauthorized') || text.includes('authentication')) {
    return 'AI portraits are not connected on Vercel yet. The organiser can turn them on (see the README), or use the free comic filter for now.';
  }
  if (text.includes('credit') || text.includes('insufficient') || text.includes('payment') || text.includes('402') || text.includes('quota')) {
    return 'The AI Gateway on Vercel is out of credit. The organiser can top it up, or use the free comic filter for now.';
  }
  if (text.includes('safety') || text.includes('blocked') || text.includes('policy') || text.includes('prohibited')) {
    return 'The AI refused that photo. Try a different one: a clear, well-lit photo of faces works best.';
  }
  if (text.includes('timeout') || text.includes('aborted')) {
    return 'The AI took too long. Give it another go.';
  }
  return 'The AI could not draw that one. Try again, or use a different photo.';
}

// Returns { data: Uint8Array, mediaType }.
export async function gtaify({ photo, mediaType = 'image/jpeg', kind = 'solo' }) {
  const mode = aiMode();
  if (mode === 'mock') {
    const wait = Number(process.env.AVATAR_MOCK_DELAY || 0);
    if (wait) await new Promise((r) => setTimeout(r, Math.min(wait, 20_000)));
    return { data: new Uint8Array(photo), mediaType };
  }
  if (mode === 'off') {
    const err = new Error('AI portraits are switched off.');
    err.friendly = 'AI portraits are switched off here. Use the free comic filter instead.';
    throw err;
  }

  const { generateText, generateImage } = await import('ai');
  const { STYLE_REF_JPEG } = await import('./style-ref.js');
  const style = Buffer.from(STYLE_REF_JPEG, 'base64');
  const models = process.env.AVATAR_MODEL ? [process.env.AVATAR_MODEL] : DEFAULT_MODELS;
  const deadline = Date.now() + 80_000;
  let lastError = null;

  for (const model of models) {
    const left = deadline - Date.now();
    if (left < 8_000) break;
    try {
      if (isLanguageImageModel(model)) {
        const result = await generateText({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt(kind) },
                { type: 'file', mediaType, data: new Uint8Array(photo) },
                { type: 'file', mediaType: 'image/jpeg', data: new Uint8Array(style) },
              ],
            },
          ],
          providerOptions: {
            google: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1' } },
            vertex: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1' } },
          },
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(left),
        });
        const image = result.files?.find((f) => f.mediaType?.startsWith('image/'));
        if (image) return { data: image.uint8Array, mediaType: image.mediaType };
        lastError = new Error(`No image returned. ${result.text || ''}`.trim());
      } else {
        const { images } = await generateImage({
          model,
          prompt: { images: [new Uint8Array(photo), new Uint8Array(style)], text: prompt(kind) },
          aspectRatio: '1:1',
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(left),
        });
        if (images?.[0]) return { data: images[0].uint8Array, mediaType: images[0].mediaType || 'image/png' };
        lastError = new Error('No image returned.');
      }
    } catch (err) {
      console.error(`Avatar generation failed with ${model}:`, err?.message || err);
      lastError = err;
    }
  }
  const err = new Error(lastError?.message || 'Generation failed');
  err.friendly = friendlyError(lastError);
  throw err;
}
