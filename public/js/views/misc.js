// Boot screen, missing-database help, first-run and 404 pages.
import { html } from '../lib.js';
import { refresh } from '../store.js';
import { FireText } from '../components.js';

export function Boot() {
  return html`<div class="boot">
    <img src="/img/title-crop.jpg" alt="Come Dine With The Traphouse" width="300" height="253" />
    <p>Warming up the oven…</p>
  </div>`;
}

export function Offline() {
  return html`<div class="page narrow">
    <div class="panel center stack" style="margin-top:24px">
      <div style="font-size:3rem">📡</div>
      <div class="panel-title">Can't reach the traphouse</div>
      <p class="muted">Check your signal. The page will keep trying by itself.</p>
      <button class="btn" onClick=${() => refresh({ force: true })}>Try again</button>
    </div>
  </div>`;
}

export function StorageMissing() {
  return html`<div class="page narrow" style="padding-top:28px">
    <div class="stack-lg">
      <div class="center">
        <img src="/img/title-crop.jpg" alt="" style="width:min(80vw,320px);margin:0 auto;border-radius:14px;border:3px solid var(--ink)" />
      </div>
      <div class="panel paper stack">
        <div class="panel-title">Nearly there. Connect the database.</div>
        <p>The portal is deployed, but it has nowhere to keep scores yet. This takes about a minute in Vercel:</p>
        <ol style="margin:0;padding-left:1.2em;line-height:1.7">
          <li>Open this project in the <strong>Vercel dashboard</strong> and go to the <strong>Storage</strong> tab.</li>
          <li>Click <strong>Create Database</strong>, pick <strong>Upstash for Redis</strong> (the free plan is plenty) and choose the <strong>Sydney</strong> region.</li>
          <li>Connect it to this project. Vercel adds the keys for you.</li>
          <li>Go to <strong>Deployments</strong> and <strong>Redeploy</strong> the latest one.</li>
        </ol>
        <p class="muted small">Optional: also create a <strong>Blob</strong> store in the same tab to switch on food photo uploads.</p>
        <button class="btn" onClick=${() => location.reload()}>I've done it, reload</button>
      </div>
    </div>
  </div>`;
}

export function NotSetUp() {
  return html`<div class="page narrow" style="padding-top:22px">
    <div class="stack-lg">
      <div class="hero-poster" style="width:min(100%,360px)">
        <img src="/img/poster.webp" alt="Come Dine With The Traphouse poster" width="912" height="1173" />
      </div>
      <div class="panel tone-purple halftone stack center">
        <${FireText} tag="h1" text="Opening soon" style="font-size:2.6rem" />
        <p>The organiser hasn't set the portal up yet. Check back once they've sent your team link.</p>
        <a class="btn" href="#/admin">I'm the organiser</a>
      </div>
    </div>
  </div>`;
}

export function NotFound() {
  return html`<div class="page narrow">
    <div class="panel center stack" style="margin-top:24px">
      <${FireText} tag="h1" text="WASTED" tone="blood" style="font-size:3.4rem" />
      <p class="muted">That page doesn't exist.</p>
      <a class="btn" href="#/">Back to base</a>
    </div>
  </div>`;
}
