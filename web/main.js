import './style.css';
import { createIcons, Sprout, TreePine, Mountain, Layers, Wheat, Hammer, Backpack,
  Compass, Settings2, RotateCw, X, Axe, Move, Sun, Maximize, VolumeX, Volume2,
  Hand, ArrowLeft, Check, Save, Pickaxe, Droplets, Timer, CircleHelp, Leaf, RotateCcw } from 'lucide';
import { Game, WORLD, ITEMS, BUILD_KINDS, BUILD_RECIPES, BUILD_NAMES, loadGame, saveGame } from './model.js';
import { IslandView } from './world.js';

const icons = { Sprout, TreePine, Mountain, Layers, Wheat, Hammer, Backpack, Compass,
  Settings2, RotateCw, X, Axe, Move, Sun, Maximize, VolumeX, Volume2, Hand, ArrowLeft,
  Check, Save, Pickaxe, Droplets, Timer, CircleHelp, Leaf, RotateCcw };
const $ = s => document.querySelector(s);
const icon = name => `<i data-lucide="${name}"></i>`;
const drawIcons = () => createIcons({ icons, attrs: { 'aria-hidden': 'true' } });
const itemIcons = { wood: 'tree-pine', stone: 'mountain', plank: 'layers', seed: 'sprout', crop: 'wheat' };
const arabic = n => new Intl.NumberFormat('ar-EG').format(n);
let storage;
try { storage = window.localStorage; } catch { storage = null; }
const loaded = loadGame(storage);
let game = loaded.game, saveBlocked = loaded.status === 'corrupt';
let view, started = false, building = false, buildIndex = 0, rotation = 0, overview = false, graphicsLost = false;
let target = null, preview = null, previewValid = false, toastTimer, dirty = false;
let lastSave = 0, time = 0, lastFrame = 0, nextInteract = 0, keys = new Set();
let stick = { x: 0, y: 0, pointer: null }, cameraDrag = null, facing = [0, -1];
let audio = null, soundEnabled = false, previousFocus = null, currentMenu = '';
const modal = $('#modal');
const paused = () => !modal.hidden || document.hidden || !started || saveBlocked || graphicsLost;

function toast(message) {
  $('#toast').textContent = message; $('#toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3000);
}
function chime(note = 560) {
  if (!soundEnabled) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(note, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(note * 1.5, audio.currentTime + 0.13);
    gain.gain.setValueAtTime(0.025, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.31);
  } catch { soundEnabled = false; }
}
function save(manual = false) {
  if (saveBlocked) return false;
  const ok = saveGame(game, storage);
  $('#save-status').innerHTML = `<span></span>${ok ? 'محفوظ على متصفحك' : 'الحفظ غير متاح · لا تغلق الصفحة'}`;
  if (ok) dirty = false;
  if (manual) toast(ok ? 'واحتك محفوظة على هذا المتصفح 🌿' : 'تعذر الحفظ. المتصفح قد يمنع التخزين أو المساحة ممتلئة.');
  return ok;
}
function resetInput() {
  keys.clear(); stick.x = 0; stick.y = 0; stick.pointer = null; cameraDrag = null;
  $('#stick-thumb').style.transform = '';
}
function closeMenu(force = false) {
  if (saveBlocked && !force) { toast('اختر عالمًا جديدًا لتجاوز الحفظ التالف'); return; }
  modal.hidden = true; currentMenu = ''; resetInput();
  previousFocus?.focus({ preventScroll: true });
}
function openMenu(kind) {
  resetInput(); previousFocus = document.activeElement; currentMenu = kind;
  const head = (symbol, title, kicker) => `<div class="modal-symbol">${icon(symbol)}</div><span class="kicker">${kicker}</span><h2 id="modal-title">${title}</h2>`;
  let content = '';
  if (kind === 'welcome') {
    content = head('sprout', loaded.status === 'new' || loaded.status === 'unavailable' ? 'مساحة صغيرة، حكايتك الكبيرة.' : 'رجعت بالسلامة لواحتك.', 'A LITTLE ROOM TO GROW');
    content += `<p>وادٍ أخضر صغير تستكشفه. لفّ فيها، اجمع من خيرها، وابنِ حكايتك حتة حتة. مفيش سباق، ومفيش مشتريات.</p><div class="steps"><div class="step">${icon('tree-pine')}اجمع</div><div class="step">${icon('hammer')}ابنِ</div><div class="step">${icon('sprout')}ازرع</div></div><button class="wide-button" id="start-game">${loaded.status === 'loaded' || loaded.status === 'recovered' ? 'كمّل حكايتك' : 'ادخل واحتي'}${icon('arrow-left')}</button><p class="tiny-note">نموذج ويب أولي · لاعب واحد · الحفظ خاص بهذا المتصفح</p>`;
  } else if (kind === 'craft') {
    content = head('axe', 'حاجة بسيطة، بإيدك.', 'THE WORKBENCH');
    content += `<p>حوّل اللي جمعته لحاجة تبني بيها. كل لوح خشبي محتاج خشبتين.</p><div class="recipe"><div class="recipe-icon">${icon('layers')}</div><div><strong>لوح خشبي</strong><p>٢ خشب ← ١ لوح</p><small id="craft-stock"></small></div></div><button class="wide-button" id="make-plank">اصنع لوحًا ${icon('hammer')}</button><p id="craft-feedback" class="tiny-note" aria-live="polite">الأرضية تحتاج لوحين وحجرًا واحدًا.</p>`;
  } else if (kind === 'bag') {
    content = head('backpack', 'كل حاجة في مكانها.', 'YOUR LITTLE COLLECTION');
    content += `<div class="bag-grid">${ITEMS.map(i => `<div class="bag-item">${icon(itemIcons[i])}<b data-bag-count="${i}">${game.state.inventory[i]}</b><span>${WORLD.LABELS[i]}</span></div>`).join('')}</div><p>معاك ٥ بذور في البداية. كل حصاد بيرجّع بذرتين. الأشجار والصخور محدودة في النموذج ده.</p>`;
  } else if (kind === 'reset' || kind === 'corrupt') {
    content = head('rotate-ccw', kind === 'corrupt' ? 'حفظك محتاج مساعدة.' : 'صفحة جديدة؟', 'A FRESH START');
    content += `<p>${kind === 'corrupt' ? 'تعذر قراءة الحفظ ونسخته السابقة. لم نستبدل بياناتك. يمكنك بدء عالم جديد بعد التأكيد، أو إغلاق الصفحة للاحتفاظ بالملفات كما هي.' : 'هتبدأ من الأول، وكل الموارد والبناء والزرع الحالي هيتبدلوا بعالم جديد. متأكد؟'}</p><button class="wide-button danger" id="confirm-reset">نعم، ابدأ عالمًا جديدًا</button>${kind === 'reset' ? '<button class="wide-button secondary" id="cancel-reset">لا، خلّيني في واحتي</button>' : ''}`;
  } else {
    content = head('leaf', 'خد نَفَس.', 'MAKE YOURSELF AT HOME');
    content += `<p>اللعب متوقف دلوقتي. واحتك هتستناك.</p><ul class="help-list"><li>اسحب العصا للحركة، والمس العالم الفارغ لتدوير الكاميرا.</li><li>اقترب من الشجر أو الصخور ثم اضغط زر التفاعل.</li><li>من «اصنع»: كل خشبتين = لوح. من «ابنِ»: الأخضر مكان متاح.</li><li>البيت: أرضية ← حوائط على الحواف (تدوير يختار الحافة) ← مدخل ← سقف. السقف يحتاج حائطين. يمكن وضع القطع فوق نفس الأرضية.</li><li>الكوخ غير المكتمل ومنضدة العمل للزينة. البناء المتاح من زر «ابنِ». الحصى حول المرج يحدد نهاية الحركة؛ التلال خلفه منظر بعيد.</li><li>الأحواض البنية: ازرع، اسقِ، انتظر ٣٠ ثانية لعب، ثم احصد.</li></ul><button class="wide-button" id="resume">كمّل اللعب ${icon('arrow-left')}</button><button class="wide-button secondary" id="save-now">احفظ التقدم ${icon('save')}</button><button class="wide-button secondary" id="new-world">عالم جديد…</button><p class="tiny-note">${window.matchMedia('(pointer:fine)').matches ? 'WASD حركة · Q/R كاميرا · E تفاعل · B بناء · C صنع · I حقيبة' : 'تقدر تلعب بالطول أو تلف الموبايل بالعرض.'}<br>معاينة متصفح وليست APK. تحتاج اتصالًا لفتحها أول مرة.<br><a href="/THIRD_PARTY.txt" target="_blank" rel="noopener">تراخيص المحرك البصري والأيقونات والخط</a></p>`;
  }
  $('#modal-content').innerHTML = content; modal.hidden = false;
  $('#modal-close').hidden = kind === 'welcome' || kind === 'corrupt'; drawIcons();
  $('#start-game')?.addEventListener('click', () => {
    started = true; closeMenu(true); chime(420);
    if (loaded.status === 'unavailable') toast('يمكنك اللعب، لكن متصفحك يمنع حفظ التقدم');
    else if (loaded.status === 'recovered') toast('استرجعنا النسخة السابقة من تقدمك');
    else toast('حرّك العصا، واقترب من شجرة أو صخرة');
  });
  $('#make-plank')?.addEventListener('click', () => {
    if (game.craft()) {
      dirty = true; chime(680); $('#craft-feedback').textContent = 'صنعت لوحًا جديدًا. خطوة أقرب لركنك الخاص!'; save();
    } else $('#craft-feedback').textContent = 'تحتاج خشبتين ومساحة في حقيبة الألواح.';
    refresh();
  });
  $('#confirm-reset')?.addEventListener('click', () => {
    game = new Game(); saveBlocked = false; started = true; building = false;
    view.builtCount = -1; facing = [0, -1]; rotation = 0; dirty = true;
    closeMenu(true); view.sync(game); refresh(); save(true);
  });
  $('#cancel-reset')?.addEventListener('click', () => closeMenu());
  $('#resume')?.addEventListener('click', () => closeMenu());
  $('#save-now')?.addEventListener('click', () => { closeMenu(); save(true); });
  $('#new-world')?.addEventListener('click', () => openMenu('reset'));
  refresh();
  modal.querySelector('button:not([hidden])')?.focus({ preventScroll: true });
}

function toggleBuild(value = !building) {
  if (saveBlocked || !started) return;
  building = value; resetInput(); refresh();
  if (building) toast('تحرك لتختار مكانًا. الأخضر صالح للبناء.');
}
function updateTarget() {
  target = game.nearest();
  if (building) {
    const [x, z] = game.state.position;
    preview = { kind: BUILD_KINDS[buildIndex], cell: [Math.round((x + facing[0] * 3) / 2), Math.round((z + facing[1] * 3) / 2)], rotation };
    previewValid = game.canBuild(preview.kind, preview.cell, rotation);
  } else preview = null;
}
let lastContextSignature = '';
function refresh() {
  updateTarget();
  for (const i of ITEMS) {
    $(`#count-${i}`).textContent = game.state.inventory[i];
    const bagCount = $(`[data-bag-count="${i}"]`); if (bagCount) bagCount.textContent = game.state.inventory[i];
  }
  if ($('#craft-stock')) {
    $('#craft-stock').textContent = `معاك ${arabic(game.state.inventory.wood)} خشب · ${arabic(game.state.inventory.plank)} ألواح`;
    $('#make-plank').disabled = game.state.inventory.wood < 2 || game.state.inventory.plank >= WORLD.STACK_LIMIT;
  }
  const milestones = game.state.milestones, count = Object.values(milestones).filter(Boolean).length;
  $('#quest-progress').textContent = `${arabic(count)} / ٣`; $('#progress-fill').style.width = `${count / 3 * 100}%`;
  for (const name of ['crafted', 'built', 'harvested']) {
    const el = $(`[data-quest="${name}"]`); el.classList.toggle('completed', milestones[name]);
    el.querySelector('.quest-check').textContent = milestones[name] ? '✓' : '';
  }
  $('#current-quest').textContent = !milestones.crafted ? 'اجمع خشبتين واصنع لوحًا' : !milestones.built ? 'لوحان + حجر = أول أرضية' : !milestones.harvested ? 'ازرع واسقِ أول نبتة' : 'أول حكاية اكتملت. كمّل على مهلك!';
  $('#build').classList.toggle('active', building); $('#explore').classList.toggle('active', !building);
  $('#build-controls').hidden = !building || !modal.hidden;
  let title = 'استكشف واحتك', detail = 'اقترب من شجرة، صخرة أو حوض زرع', label = 'تفاعل', actionIcon = 'hand', ready = false, waiting = false;
  if (building && preview) {
    $('#build-name').textContent = BUILD_NAMES[preview.kind];
    $('#build-cost').textContent = Object.entries(BUILD_RECIPES[preview.kind]).map(([i, n]) => `${arabic(n)} ${WORLD.LABELS[i]}`).join(' + ');
    title = previewValid ? 'مكان لركنك الجديد' : 'البناء غير متاح هنا';
    detail = previewValid ? 'اضغط لوضع القطعة' : game.buildReason(preview.kind, preview.cell, rotation);
    label = 'ابنِ هنا'; actionIcon = 'hammer'; ready = previewValid;
  } else if (target?.type === 'resource') {
    title = target.kind === 'wood' ? 'شوية خشب لبداية جديدة' : 'حجر على حجر';
    detail = `متبقي ${arabic(3 - (game.state.gathered[target.id] || 0))} وحدات من هذا المورد`;
    label = 'اجمع'; actionIcon = target.kind === 'wood' ? 'axe' : 'pickaxe'; ready = true;
  } else if (target?.type === 'plot') {
    if (!target.crop) { title = 'هنا ممكن تنبت حكاية'; detail = 'بذرة واحدة، وبداية صغيرة'; label = 'ازرع'; actionIcon = 'sprout'; ready = true; }
    else if (!target.crop.watered) { title = 'نبتتك محتاجة شوية ميّه'; detail = 'اسقِها لتبدأ في النمو'; label = 'اسقِ'; actionIcon = 'droplets'; ready = true; }
    else if (target.crop.remaining > 0) { title = 'بتكبر على مهلك'; detail = `جاهزة خلال ${arabic(Math.ceil(target.crop.remaining))} ثانية لعب`; label = 'بتنمو'; actionIcon = 'timer'; waiting = true; }
    else { title = 'تعبك طرح خير'; detail = 'محصولان وبذرتان مستنيينك'; label = 'احصد'; actionIcon = 'wheat'; ready = true; }
  }
  $('#target-title').textContent = title; $('#target-detail').textContent = detail; $('#action-label').textContent = label;
  const signature = actionIcon;
  if (signature !== lastContextSignature) { $('#action-icon').innerHTML = icon(actionIcon); drawIcons(); lastContextSignature = signature; }
  $('#interact').classList.toggle('ready', ready); $('#interact').classList.toggle('waiting', waiting);
  if (view) { view.sync(game); view.highlight(building ? null : target); view.preview(building ? preview : null, previewValid); }
}
function interact() {
  if (paused() || performance.now() < nextInteract) return;
  nextInteract = performance.now() + 220; updateTarget();
  if (building) {
    if (game.build(preview.kind, preview.cell, rotation)) { dirty = true; chime(720); toast('ركن صغير، معمول بإيدك ✦'); save(); }
    else toast('تحتاج موارد كافية ومكانًا خاليًا أمامك');
  } else if (target?.type === 'resource') {
    if (game.gather(target.id)) { dirty = true; chime(target.kind === 'wood' ? 400 : 520); toast(target.kind === 'wood' ? '+١ خشب · بداية حلوة' : '+١ حجر · على مهلنا نبني'); }
    else toast('الحقيبة ممتلئة أو المورد غير متاح');
  } else if (target?.type === 'plot') {
    const result = game.farm(target.cell);
    if (result) {
      dirty = true; chime(result === 'harvest' ? 820 : 600);
      toast({ plant: 'زرعت بذرة! اسقِها مرة لتبدأ النمو.', water: 'اتسقت. ٣٠ ثانية لعب وتطرح خيرها.', harvest: '+٢ محصول و+٢ بذور. تستاهل!' }[result]); save();
    } else toast(target.crop?.remaining > 0 ? 'لسه بتكبر… استكشف لحد ما تجهز' : 'راجع البذور ومساحة الحقيبة');
  } else toast('قرّب من الشجر أو الصخور أو أحواض الزرع البنية');
  refresh();
}

// Pointer capture prevents a stuck joystick when a thumb leaves its circle.
const joystick = $('#joystick');
function updateStick(e) {
  const rect = joystick.getBoundingClientRect(), radius = rect.width * 0.32;
  const x = (e.clientX - rect.left - rect.width / 2) / radius, y = (e.clientY - rect.top - rect.height / 2) / radius;
  const length = Math.max(1, Math.hypot(x, y)); stick.x = x / length; stick.y = y / length;
  if (Math.hypot(stick.x, stick.y) < 0.1) stick.x = stick.y = 0;
  $('#stick-thumb').style.transform = `translate(${stick.x * radius}px,${stick.y * radius}px)`;
}
joystick.addEventListener('pointerdown', e => {
  if (paused() || stick.pointer !== null) return; e.preventDefault(); stick.pointer = e.pointerId;
  joystick.setPointerCapture(e.pointerId); updateStick(e);
});
joystick.addEventListener('pointermove', e => { if (e.pointerId === stick.pointer) { e.preventDefault(); updateStick(e); } });
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(event, e => {
  if (e.pointerId === stick.pointer) { stick.pointer = null; stick.x = stick.y = 0; $('#stick-thumb').style.transform = ''; }
});
const canvas = $('#world');
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (paused() || cameraDrag) return; cameraDrag = { id: e.pointerId, x: e.clientX }; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (cameraDrag?.id !== e.pointerId || paused()) return;
  game.state.yaw = Math.atan2(Math.sin(game.state.yaw - (e.clientX - cameraDrag.x) * 0.006), Math.cos(game.state.yaw - (e.clientX - cameraDrag.x) * 0.006));
  cameraDrag.x = e.clientX; dirty = true;
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, e => { if (e.pointerId === cameraDrag?.id) cameraDrag = null; });

$('#overview').addEventListener('click', () => { overview = !overview; toast(overview ? 'نظرة على الوادي. اضغط البوصلة للعودة.' : 'رجعنا خلف الشخصية'); });
$('#interact').addEventListener('click', interact);
$('#build').addEventListener('click', () => toggleBuild());
$('#explore').addEventListener('click', () => toggleBuild(false));
$('#cancel-build').addEventListener('click', () => toggleBuild(false));
$('#craft').addEventListener('click', () => { if (started && !saveBlocked) openMenu('craft'); });
$('#bag').addEventListener('click', () => { if (started && !saveBlocked) openMenu('bag'); });
$('#settings').addEventListener('click', () => openMenu(saveBlocked ? 'corrupt' : !started ? 'welcome' : 'settings'));
$('#modal-close').addEventListener('click', () => closeMenu());
$('#cycle').addEventListener('click', () => { buildIndex = (buildIndex + 1) % BUILD_KINDS.length; refresh(); });
$('#rotate').addEventListener('click', () => { rotation = (rotation + 1) % 4; refresh(); });
$('#sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled; $('#sound').innerHTML = icon(soundEnabled ? 'volume-2' : 'volume-x');
  $('#sound').setAttribute('aria-label', soundEnabled ? 'إيقاف الصوت' : 'تشغيل الصوت'); drawIcons(); chime();
});
$('#fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { toast('ملء الشاشة غير متاح داخل هذا المتصفح. تقدر تكمل عادي.'); }
});
window.addEventListener('keydown', e => {
  if (!modal.hidden) {
    if (e.code === 'Escape' && currentMenu !== 'welcome' && !saveBlocked) closeMenu();
    if (e.code === 'Tab') {
      const focusable = [...modal.querySelectorAll('button:not([hidden]):not(:disabled)')];
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    return;
  }
  const controlled = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyR','KeyE','KeyB','KeyC','KeyI','KeyT','Digit1','Escape'];
  if (controlled.includes(e.code)) e.preventDefault();
  keys.add(e.code); if (e.repeat) return;
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyB') toggleBuild();
  if (e.code === 'Digit1') toggleBuild(false);
  if (e.code === 'KeyC') openMenu('craft');
  if (e.code === 'KeyI') openMenu('bag');
  if (e.code === 'KeyT') { rotation = (rotation + 1) % 4; refresh(); }
  if (e.code === 'Escape') { if (building) toggleBuild(false); else openMenu('settings'); }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { resetInput(); if (dirty) save(); });
document.addEventListener('visibilitychange', () => { resetInput(); if (document.hidden && dirty) save(); });
window.addEventListener('pagehide', () => { if (dirty) save(); });
window.addEventListener('resize', () => view?.resize());
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); graphicsLost = true; resetInput(); save(); toast('توقف عرض الرسوم. أعد فتح الصفحة لاسترجاع تقدمك.'); });

canvas.addEventListener('webglcontextrestored', () => { graphicsLost = false; toast('رجعت الرسوم. تقدر تكمل.'); });

try {
  view = new IslandView(canvas); drawIcons(); refresh();
  openMenu(saveBlocked ? 'corrupt' : 'welcome');
  let hudTime = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const renderDt = Math.min((now - (lastFrame || now)) / 1000, 0.25);
    const dt = Math.min(renderDt, 0.05); lastFrame = now; time += dt;
    let moving = false;
    if (!paused()) {
      game.tick(dt);
      let x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      let z = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
      if (Math.hypot(stick.x, stick.y) > 0.1) { x = stick.x; z = stick.y; }
      const length = Math.max(1, Math.hypot(x, z)); x /= length; z /= length;
      const yaw = game.state.yaw, dx = x * Math.cos(yaw) + z * Math.sin(yaw), dz = -x * Math.sin(yaw) + z * Math.cos(yaw);
      if (Math.hypot(x, z) > 0.01) {
        moving = true; game.walk(dx * dt * 4.2, dz * dt * 4.2);
        facing = [dx / Math.hypot(dx, dz), dz / Math.hypot(dx, dz)];
        const angle = Math.atan2(-dx, -dz), current = view.avatar.rotation.y;
        view.avatar.rotation.y += Math.atan2(Math.sin(angle - current), Math.cos(angle - current)) * Math.min(1, dt * 12);
        dirty = true;
      }
      const orbit = Number(keys.has('KeyR')) - Number(keys.has('KeyQ'));
      if (orbit) { game.state.yaw = Math.atan2(Math.sin(yaw + orbit * dt), Math.cos(yaw + orbit * dt)); dirty = true; }
      if (Object.keys(game.state.crops).length) dirty = true;
      lastSave += dt;
      if (lastSave > 15) { lastSave = 0; if (dirty) save(); }
    }
    hudTime += dt;
    if (hudTime > 0.1) { refresh(); hudTime = 0; }
    if (!document.hidden) view.render(game, renderDt, moving, !started || overview, time);
  }
  requestAnimationFrame(frame);
  // Development-only observability for real browser regression tests. Stripped in production.
  if (import.meta.env.DEV) window.__oasis = { get game() { return game; }, get view() { return view; }, refresh, interact, save, get paused() { return paused(); } };
} catch (error) {
  console.error(error);
  const message = document.createElement('div'); message.className = 'fatal-message';
  message.textContent = 'متصفحك لم يستطع تشغيل رسوم 3D. جرّب فتح المعاينة في Chrome محدث، وتأكد أن تسريع الرسوم متاح. لم نحذف حفظك.';
  document.body.append(message);
}
