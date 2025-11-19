/**
 * ASCII Camera – lógica principal
 *
 * Flujo:
 * 1) Acceso a cámara y reproducción en <video> oculto.
 * 2) Por frame: muestrear en <canvas>, convertir a ASCII y mostrar en <pre>.
 * 3) Ajustar escala del <pre> para encajar en el contenedor visible.
 * 4) Controles: densidad, columnas, charset, invertir, y colores del área ASCII.
 */

// Referencias a elementos del DOM
const video = document.getElementById('video');      // <video> oculto con el stream de la cámara
const work = document.getElementById('work');        // <canvas> para muestrear píxeles
const asciiEl = document.getElementById('ascii');    // <pre> donde se imprime el ASCII
const stageEl = document.getElementById('stage');    // contenedor visible

// Controles de UI
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const scaleRange = document.getElementById('scaleRange'); // “Densidad”: factor multiplicador
const densityOut = document.getElementById('densityOut');  // indicador (e.g., 1.2x)
const colsInput = document.getElementById('colsInput');    // columnas base
const charsetSelect = document.getElementById('charsetSelect'); // caracteres de menor→mayor densidad
const invertCheckbox = document.getElementById('invertCheckbox'); // invierte luminancia
const bgColor = document.getElementById('bgColor');        // color de fondo del ASCII
const fgColor = document.getElementById('fgColor');        // color de texto del ASCII

// Estado de ejecución
let stream = null; // MediaStream activo
let animId = null; // id del requestAnimationFrame
let ctx = work.getContext('2d', { willReadFrequently: true }); // contexto 2D
let lastW = -1, lastH = -1; // cache de tamaño para reajustar escala

// Corrección de aspecto: caracteres ~2x más altos que anchos
const CHAR_ASPECT = 2.0;

// Listeners de UI
startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);
scaleRange.addEventListener('input', () => {
  if (densityOut) densityOut.textContent = `${Number(scaleRange.value).toFixed(1)}x`;
});
colsInput.addEventListener('change', () => {});
charsetSelect.addEventListener('change', () => {});
invertCheckbox.addEventListener('change', () => {});
if (bgColor) bgColor.addEventListener('input', onThemeChange);
if (fgColor) fgColor.addEventListener('input', onThemeChange);

/** Inicia la cámara y el bucle de render. */
async function start() {
  try {
    startBtn.disabled = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este navegador no soporta getUserMedia.');
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });

    video.srcObject = stream;
    await video.play();

    stopBtn.disabled = false;
    loop();
  } catch (err) {
    console.error(err);
    alert('No se pudo iniciar la cámara: ' + (err.message || err));
    startBtn.disabled = false;
  }
}

/** Detiene el bucle y libera la cámara. */
function stop() {
  stopBtn.disabled = true;
  if (animId) cancelAnimationFrame(animId);
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
  startBtn.disabled = false;
}

/** Bucle principal: muestrea el frame, lo convierte a ASCII y lo imprime. */
function loop() {
  animId = requestAnimationFrame(loop);
  if (!video.videoWidth || !video.videoHeight) return;

  const cols = Math.max(40, Math.min(240, Number(colsInput.value) || 120));
  const scale = Number(scaleRange.value) || 1.0; // factor de densidad
  const targetW = Math.max(20, Math.floor(cols * scale));
  const ratio = video.videoHeight / video.videoWidth;
  const targetH = Math.max(10, Math.floor(targetW * ratio / CHAR_ASPECT));

  work.width = targetW;
  work.height = targetH;

  ctx.drawImage(video, 0, 0, targetW, targetH);
  const { data } = ctx.getImageData(0, 0, targetW, targetH);
  const chars = charsetSelect.value;
  const invert = invertCheckbox.checked;

  let out = '';
  const len = chars.length - 1;
  for (let y = 0; y < targetH; y++) {
    let row = '';
    for (let x = 0; x < targetW; x++) {
      const i = (y * targetW + x) * 4;
      const r = data[i], g = data[i+1], b = data[i+2];
      // Luminancia perceptual (ITU-R BT.601)
      let v = 0.299 * r + 0.587 * g + 0.114 * b;
      if (invert) v = 255 - v;
      const idx = Math.max(0, Math.min(len, Math.round((v / 255) * len)));
      row += chars[idx];
    }
    out += row + '\n';
  }

  asciiEl.textContent = out;

  if (lastW !== targetW || lastH !== targetH) {
    fitToStage();
    lastW = targetW; lastH = targetH;
  }
}

// Ahorro de CPU: si la pestaña se oculta, detenemos el stream
window.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (stream) stop();
  }
});

// Inicializa el indicador de densidad
if (densityOut && scaleRange) {
  densityOut.textContent = `${Number(scaleRange.value).toFixed(1)}x`;
}

window.addEventListener('resize', fitToStage);

/** Escala el <pre> para encajar dentro del contenedor visible sin scroll. */
function fitToStage() {
  if (!stageEl) return;
  // Reset scale to measure actual size
  asciiEl.style.transform = 'scale(1)';
  const sw = stageEl.clientWidth;
  const sh = stageEl.clientHeight;
  const pw = asciiEl.scrollWidth;
  const ph = asciiEl.scrollHeight;
  if (!sw || !sh || !pw || !ph) return;
  const s = Math.min(sw / pw, sh / ph, 1);
  asciiEl.style.transform = `scale(${s})`;
}

/** Tema de la imagen: aplica los pickers únicamente al área ASCII. */
function onThemeChange() {
  const target = stageEl || asciiEl;
  if (bgColor && bgColor.value) target.style.setProperty('--ascii-bg', bgColor.value);
  if (fgColor && fgColor.value) target.style.setProperty('--ascii-fg', fgColor.value);
}

/** Inicializa los pickers a partir de los colores actuales del área ASCII. */
(function initThemePickers(){
  const csStage = getComputedStyle(stageEl || asciiEl);
  const csPre = getComputedStyle(asciiEl);
  const bg = csStage.getPropertyValue('background-color').trim();
  const fg = csPre.getPropertyValue('color').trim();
  const toHex = c => {
    const m = c.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return null;
    const r = Number(m[1]).toString(16).padStart(2,'0');
    const g = Number(m[2]).toString(16).padStart(2,'0');
    const b = Number(m[3]).toString(16).padStart(2,'0');
    return `#${r}${g}${b}`.toLowerCase();
  };
  const bgHex = toHex(bg);
  const fgHex = toHex(fg);
  if (bgColor && bgHex) bgColor.value = bgHex;
  if (fgColor && fgHex) fgColor.value = fgHex;
})();
