const $ = s => document.querySelector(s);
const app = $('#app'), stage = $('#stage'), canvas = $('#gl'), ui = $('#ui'), drawer = $('#drawer');
const toastEl = $('#toast'), fallback = $('#fallback'), statusTxt = $('#statusTxt'), dotEl = $('#status .dot');

const S = { mode:'idle', kind:null, depth:3.5, ipd:0.064, fov:80, yaw:0, pitch:0,
            gyro:false, muted:true, url:null, open:false };
const buzz = ms => { try { navigator.vibrate?.(ms); } catch {} };
const say = (t,k='') => { statusTxt.textContent = t; dotEl.className = 'dot' + (k?' '+k:''); };
let toastTimer;
const warn = t => { toastEl.textContent = t; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>toastEl.classList.remove('show'),5500); buzz(30); };

const PROXY_DEFAULT = location.origin.includes('onrender.com')
  ? location.origin.replace('cinema-vr', 'cinema-vr-proxy') : '';
const getProxy = () => (localStorage.getItem('proxy') || '').replace(/\/$/, '');
const isProxied = () => location.search.includes('proxied=1');

function parse(raw) {
  const u = (raw||'').trim(); if(!u) return null; let m;
  if ((m = u.match(/(?:hotstar|jiohotstar)\.com\/(?:([a-z]{2,3})\/)?(movies|tv|sports|shows)\/([^/?#]+)\/?(\d+)?/i)))
    return { kind:'hotstar', lang:m[1]||'in', type:m[2].toLowerCase(), slug:m[3], id:m[4] };
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/)))
    return { kind:'youtube', id:m[1] };
  if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return { kind:'vimeo', id:m[1] };
  if ((m = u.match(/dailymotion\.com\/(?:video|embed\/video)\/(\w+)/))) return { kind:'dailymotion', id:m[1] };
  if ((m = u.match(/twitch\.tv\/(?:videos\/(\d+)|([\w]+))/))) return { kind:'twitch', id:m[1], channel:m[2] };
  if (/\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i.test(u) || /\.m3u8(\?|#|$)/i.test(u)) return { kind:'file', id:u };
  if (/^https?:\/\//i.test(u)) return { kind:'unknown', id:u };
  return null;
}
const targetUrl = p => p.kind === 'hotstar'
  ? `https://www.hotstar.com/${p.lang}/${p.type}/${p.slug}${p.id ? '/' + p.id : ''}` : p.id;

function embedSrc(p, eye) {
  const off = eye === 0 ? S.depth : -S.depth;
  const mute = (S.muted || eye === 0) ? 1 : 0;
  if (p.kind === 'hotstar') {
    const px = getProxy();
    const t = targetUrl(p);
    return px ? `${px}/p/?url=${encodeURIComponent(t)}` : t;
  }
  if (p.kind === 'youtube') return `https://www.youtube.com/embed/${p.id}?autoplay=1&mute=${mute}&controls=0&rel=0&playsinline=1&loop=1&playlist=${p.id}&yaw=${(-off).toFixed(2)}`;
  if (p.kind === 'vimeo') return `https://player.vimeo.com/video/${p.id}?autoplay=1&muted=${mute}&controls=0&loop=1&dnt=1`;
  if (p.kind === 'dailymotion') return `https://www.dailymotion.com/embed/video/${p.id}?autoplay=1&mute=${mute}&controls=0`;
  if (p.kind === 'twitch') return `https://player.twitch.tv/?${p.id?'video=v'+p.id:'channel='+p.channel}&parent=${location.hostname}&autoplay=true&muted=${!!mute}`;
  return null;
}

let THREE=null, renderer=null, camL, camR, rig, video, texL, texR, geo, scene;
const ptrs = new Map();

async function initGL() {
  try { THREE = await import('three'); }
  catch { try { THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'); }
          catch { return false; } }
  renderer = new THREE.WebGLRenderer({ canvas, antialias:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);
  scene = new THREE.Scene(); rig = new THREE.Object3D(); scene.add(rig);
  camL = new THREE.PerspectiveCamera(S.fov, 1, .1, 2000);
  camR = new THREE.PerspectiveCamera(S.fov, 1, .1, 2000);
  camL.layers.set(1); camR.layers.set(2); rig.add(camL, camR);
  geo = new THREE.SphereGeometry(100, 56, 36);
  video = document.createElement('video');
  video.playsInline = true; video.setAttribute('playsinline',''); video.loop = true;
  video.crossOrigin = 'anonymous'; video.preload = 'auto'; video.muted = true;
  video.addEventListener('loadedmetadata', () => say('360 ready — drag to look','ok'));
  video.addEventListener('error', () => { if (S.mode === 'sphere') say('Cannot play this file','bad'); });
  video.addEventListener('play', () => $('#play').innerHTML = '<span class="g">&#10074;&#10074;</span>Pause');
  video.addEventListener('pause', () => $('#play').innerHTML = '<span class="g">&#9654;</span>Play');
  texL = new THREE.VideoTexture(video); texR = new THREE.VideoTexture(video);
  for (const t of [texL, texR]) {
    t.colorSpace = THREE.SRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  }
  const mk = (tex,l) => { const m = new THREE.Mesh(geo,
    new THREE.MeshBasicMaterial({ map:tex, side:THREE.BackSide })); m.layers.set(l); return m; };
  scene.add(mk(texL,1), mk(texR,2));
  applyIpd(); new ResizeObserver(resize).observe(stage); resize(); loop();
  return true;
}
const applyIpd = () => { if (!camL) return; camL.position.x = -S.ipd/2; camR.position.x = S.ipd/2; };
function resize() {
  if (!renderer) return;
  const w = stage.clientWidth||1, h = stage.clientHeight||1;
  renderer.setSize(w,h,false);
  const a = (w/2)/h; camL.aspect = camR.aspect = a;
  camL.updateProjectionMatrix(); camR.updateProjectionMatrix();
}
function loop() {
  requestAnimationFrame(loop);
  if (S.mode !== 'sphere' || !renderer) return;
  if (!S.gyro) rig.rotation.set(S.pitch, S.yaw, 0, 'YXZ');
  const w = canvas.clientWidth, h = canvas.clientHeight; if (!w||!h) return;
  renderer.setScissorTest(true);
  renderer.setViewport(0,0,w/2,h); renderer.setScissor(0,0,w/2,h); renderer.render(scene, camL);
  renderer.setViewport(w/2,0,w/2,h); renderer.setScissor(w/2,0,w/2,h); renderer.render(scene, camR);
}

stage.addEventListener('pointerdown', e => { if (S.mode === 'embed') return;
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  stage.classList.add('drag'); stage.setPointerCapture(e.pointerId); });
stage.addEventListener('pointermove', e => { const p = ptrs.get(e.pointerId); if (!p) return;
  S.yaw += (e.clientX-p.x)*.0028;
  S.pitch = Math.max(-1.5, Math.min(1.5, S.pitch + (e.clientY-p.y)*.0028));
  p.x = e.clientX; p.y = e.clientY; });
const drop = e => { ptrs.delete(e.pointerId); if (!ptrs.size) stage.classList.remove('drag'); };
stage.addEventListener('pointerup', drop); stage.addEventListener('pointercancel', drop);
stage.addEventListener('wheel', e => { if (S.mode !== 'sphere' || !camL) return; e.preventDefault();
  S.fov = Math.max(40, Math.min(100, S.fov + Math.sign(e.deltaY)*3));
  camL.fov = camR.fov = S.fov; camL.updateProjectionMatrix(); camR.updateProjectionMatrix(); },
  { passive:false });
addEventListener('keydown', e => {
  const k = e.key;
  if (k==='ArrowLeft') S.yaw -= .07; else if (k==='ArrowRight') S.yaw += .07;
  else if (k==='ArrowUp') S.pitch = Math.min(1.5, S.pitch+.07);
  else if (k==='ArrowDown') S.pitch = Math.max(-1.5, S.pitch-.07);
  else if (k==='f'||k==='F') $('#vr').click(); else return;
  e.preventDefault();
});

let zVec, eul, q0, q1;
async function initGyro() {
  zVec = new THREE.Vector3(0,0,1); eul = new THREE.Euler();
  q0 = new THREE.Quaternion(); q1 = new THREE.Quaternion(-Math.sqrt(.5),0,0,Math.sqrt(.5));
  addEventListener('deviceorientation', e => {
    if (!S.gyro || e.alpha == null || !rig) return;
    eul.set(THREE.MathUtils.degToRad(e.beta), THREE.MathUtils.degToRad(e.alpha),
            -THREE.MathUtils.degToRad(e.gamma), 'YXZ');
    rig.quaternion.setFromEuler(eul).multiply(q1)
      .multiply(q0.setFromAxisAngle(zVec, -THREE.MathUtils.degToRad(screen.orientation?.angle||0)));
  });
}

function cinema() {
  const d = S.depth, deg = d*2.2, shift = d*1.3, scale = 1 + d*.03;
  [['#paneL',-deg,shift],['#paneR',deg,-shift]].forEach(([sel,r,s]) => {
    const f = document.querySelector(sel + ' iframe');
    if (f) f.style.transform =
      `translateX(${s.toFixed(2)}%) rotateY(${r.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
  });
}

let hls = null;
function teardown() {
  S.mode = 'idle'; app.classList.remove('split'); fallback.classList.remove('show');
  $('#idle').style.display = 'flex';
  $('#paneL').innerHTML = ''; $('#paneR').innerHTML = '';
  if (hls) { hls.destroy(); hls = null; }
  if (video) { try { video.pause(); } catch {} video.removeAttribute('src'); video.load(); }
  say('Idle');
}
async function loadSphere(url) {
  teardown();
  if (!renderer && !(await initGL())) {
    $('#idle').style.display = 'flex';
    warn('WebGL unavailable — 360 files will not render.'); return;
  }
  S.mode = 'sphere'; $('#idle').style.display = 'none'; say('Loading…');
  if (/\.m3u8(\?|#|$)/i.test(url)) {
    const go = () => { hls = new window.Hls({ maxBufferLength:24 }); hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.ERROR, (_,d) => { if (d.fatal) say('Stream error','bad'); }); };
    if (window.Hls) go();
    else import('https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js')
      .then(m => { window.Hls = m.default; go(); }).catch(() => say('HLS engine failed','bad'));
  } else video.src = url;
  video.play().catch(() => {});
}
function loadEmbed(p) {
  teardown(); S.mode = 'embed'; S.kind = p.kind; app.classList.add('split');
  $('#idle').style.display = 'none'; cinema();
  for (const [el,eye] of [[$('#paneL'),0],[$('#paneR'),1]]) {
    const f = document.createElement('iframe');
    f.src = embedSrc(p, eye);
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true; f.referrerPolicy = 'strict-origin-when-cross-origin';
    el.appendChild(f);
  }
  if (p.kind === 'hotstar') {
    say(getProxy() ? 'Hotstar via proxy' : 'Hotstar — DRM, embed may be blocked', 'warn');
    $('#fbBody').textContent = 'Hotstar restricts framing and may stay black. Try the proxy, open the app, or open the browser.';
    setTimeout(() => { if (S.mode === 'embed' && S.kind === 'hotstar') fallback.classList.add('show'); }, 3800);
  } else if (p.kind === 'unknown') say('Trying a plain embed','warn');
  else say('Embedding ' + p.kind, 'ok');
}
function load(raw) {
  const p = parse(raw); if (!p) { warn('That is not a link.'); return; }
  S.url = raw; buzz(15);
  const u = new URL(location); u.searchParams.set('u', raw); history.replaceState(null,'',u);
  p.kind === 'file' ? loadSphere(p.id) : loadEmbed(p);
}

let hideTimer;
const showUI = (auto=true) => { ui.classList.remove('hidden'); S.open = true;
  clearTimeout(hideTimer); if (auto) hideTimer = setTimeout(()=>{ if (S.mode!=='idle') hideUI(); },5000); };
const hideUI = () => { ui.classList.add('hidden'); drawer.classList.remove('open'); S.open = false; };

let tapT=0, tapX=0, tapY=0;
stage.addEventListener('pointerdown', e => { tapT=Date.now(); tapX=e.clientX; tapY=e.clientY; });
stage.addEventListener('pointerup', e => { if (ptrs.size) return;
  if (Date.now()-tapT < 260 && Math.hypot(e.clientX-tapX, e.clientY-tapY) < 12) S.open ? hideUI() : showUI(); });
$('#grab').onclick = () => drawer.classList.toggle('open');
$('#load').onclick = () => { load($('#url').value); showUI(); };
$('#url').addEventListener('keydown', e => { if (e.key === 'Enter') { e.target.blur(); load(e.target.value); } });
const pick = () => $('#file').click();
$('#fileBtn').onclick = pick; $('#fileBtn2').onclick = pick;
$('#file').onchange = e => { const f = e.target.files?.[0]; if (!f) return;
  $('#url').value = f.name; loadSphere(URL.createObjectURL(f)); };
$('#demoBtn').onclick = () => { const d = 'https://cdn.aframe.io/360-video-boilerplate/video/city.mp4';
  $('#url').value = d; loadSphere(d); };

$('#depth').oninput = e => { S.depth = +e.target.value; cinema();
  if (S.mode === 'sphere') { S.ipd = .02 + S.depth*.014; applyIpd(); } };
$('#ipd').oninput = e => { S.ipd = +e.target.value; applyIpd(); };
$('#play').onclick = () => { if (S.mode !== 'sphere') { if (S.url) load(S.url); return; }
  if (video.paused) video.play().catch(()=>{}); else video.pause(); };
$('#resync').onclick = () => { if (S.url && S.mode === 'embed') { load(S.url); buzz(25); } };
$('#sound').onclick = () => { S.muted = !S.muted; $('#sound').classList.toggle('on', !S.muted);
  if (video) video.muted = S.muted; if (S.mode === 'embed' && S.url) load(S.url); };
$('#gyro').onclick = async () => {
  if (!S.gyro) { try {
      if (window.DeviceOrientationEvent?.requestPermission) await DeviceOrientationEvent.requestPermission();
      if (!zVec) await initGyro();
      S.gyro = true; $('#gyro').classList.add('on'); say('Gyro active','ok');
    } catch { warn('Motion permission denied.'); } }
  else { S.gyro = false; $('#gyro').classList.remove('on'); if (rig) rig.rotation.set(0,0,0); }
};
$('#proxy').onclick = () => {
  const cur = getProxy() || PROXY_DEFAULT;
  const v = prompt('Proxy service URL', cur);
  if (v === null) return;
  if (!v.trim()) { localStorage.removeItem('proxy'); $('#proxy').classList.remove('on'); }
  else { localStorage.setItem('proxy', v.trim().replace(/\/$/,'')); $('#proxy').classList.add('on'); }
  if (S.url && S.kind === 'hotstar') load(S.url);
};
let wakeLock = null;
$('#vr').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (stage.requestFullscreen) await stage.requestFullscreen();
    else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
    else warn('Fullscreen unsupported — rotate manually.');
    if (!S.gyro) $('#gyro').click();
    try { await screen.orientation?.lock?.('landscape'); } catch {}
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
    app.classList.add('cardboard'); showUI();
  } catch { warn('Fullscreen unavailable on this browser.'); }
};
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) { app.classList.remove('cardboard');
    wakeLock?.release?.(); wakeLock = null; } });
$('#recenter').onclick = () => { S.yaw = 0; S.pitch = 0; if (rig) rig.rotation.set(0,0,0); buzz(15); };

const openInfo = () => $('#info').classList.add('show');
$('#infoBtn').onclick = openInfo; $('#hsHelp').onclick = openInfo;
$('#infoClose').onclick = () => $('#info').classList.remove('show');
$('#fbSkip').onclick = () => fallback.classList.remove('show');
$('#fbWeb').onclick = () => { if (S.url) open(S.url,'_blank','noopener'); };
$('#fbProxy').onclick = () => {
  fallback.classList.remove('show');
  if (!getProxy()) { localStorage.setItem('proxy', PROXY_DEFAULT); $('#proxy').classList.add('on'); }
  if (S.url) load(S.url);
};
$('#fbApp').onclick = () => {
  if (!S.url) return;
  const p = parse(S.url);
  const deep = p?.kind === 'hotstar'
    ? `hotstar://www.hotstar.com/${p.lang}/${p.type}/${p.slug}${p.id?'/'+p.id:''}` : S.url;
  location.href = deep;
  setTimeout(() => { if (!document.hidden) open(S.url,'_blank','noopener'); }, 1400);
};

if ('serviceWorker' in navigator) addEventListener('load',
  () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
if (getProxy()) $('#proxy').classList.add('on');
const start = new URL(location).searchParams.get('u') || location.hash.slice(1);
if (start) { $('#url').value = start; load(start); }
else setTimeout(() => { if (S.mode === 'idle') showUI(false); }, 600);
say('Idle');