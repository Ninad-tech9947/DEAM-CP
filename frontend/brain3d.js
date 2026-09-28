// 3D wireframe brain made of Pune's grid: in-feed -> substations -> areas -> places.
// Uses three.js (global THREE). Colours come from the page's CSS variables, so the brain
// follows light and dark mode and its background stays transparent.
window.Brain3D = (() => {
  // repeatable random numbers, so the brain looks the same every time
  function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  const CEREBRUM = {c: [0, 0.15, 0], r: [1.35, 0.92, 1.0]};
  const CEREBELLUM = {c: [-0.82, -0.58, 0], r: [0.5, 0.3, 0.68]};
  const STEM = {top: [-0.35, -0.5, 0], bottom: [-0.45, -1.32, 0]};
  // one lobe per region: Central, Western, Eastern, Northern
  const ANCHORS = [[0.2, -0.22, 0], [0.82, 0.22, 0], [-0.82, 0.28, 0], [-0.08, 0.72, 0]];

  function inCerebrum(p, s = 1){
    const [cx, cy, cz] = CEREBRUM.c, [rx, ry, rz] = CEREBRUM.r;
    return ((p[0] - cx) / (rx * s)) ** 2 + ((p[1] - cy) / (ry * s)) ** 2 + ((p[2] - cz) / (rz * s)) ** 2 <= 1;
  }
  function clampInside(p, s){
    // pull a point back toward the centre until it is inside the (scaled) cerebrum
    const c = CEREBRUM.c; let q = p.slice();
    for (let i = 0; i < 30 && !inCerebrum(q, s); i++) q = q.map((v, k) => c[k] + (v - c[k]) * 0.95);
    if (q[1] < -0.5) q[1] = -0.5 + (q[1] + 0.5) * 0.3;
    return q;
  }
  function fib(n, i){
    // i-th of n evenly spread directions on a sphere
    const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  }

  function meshPoints(){
    const rand = rng(7), pts = [];
    const onEllipsoid = (E, n, keep) => {
      for (let i = 0; i < n; i++){
        const d = fib(n, i), wob = 0.97 + 0.05 * rand();
        const p = d.map((v, k) => E.c[k] + v * E.r[k] * wob);
        if (keep(p)) pts.push(p);
      }
    };
    onEllipsoid(CEREBRUM, 330, p => p[1] > -0.48);
    onEllipsoid(CEREBELLUM, 60, p => !inCerebrum(p, 0.98));
    for (let i = 0; i <= 8; i++){
      const t = i / 8, a = i * 2.1;
      pts.push([STEM.top[0] + (STEM.bottom[0] - STEM.top[0]) * t + Math.cos(a) * 0.1, STEM.top[1] + (STEM.bottom[1] - STEM.top[1]) * t, Math.sin(a) * 0.1]);
    }
    return pts;
  }

  function nearestEdges(pts, k){
    const seen = new Set(), edges = [];
    pts.forEach((p, i) => {
      const d = pts.map((q, j) => [j, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2]).filter(x => x[0] !== i).sort((a, b) => a[1] - b[1]).slice(0, k);
      d.forEach(([j]) => { const key = i < j ? i + '-' + j : j + '-' + i; if (!seen.has(key)){ seen.add(key); edges.push([i, j]); } });
    });
    return edges;
  }

  function create(container, CFG, onSelect){
    if (!window.THREE){
      container.insertAdjacentHTML('beforeend', '<p class="note" style="padding:16px">The 3D view needs the three.js library, which did not load. Check your internet connection.</p>');
      return {update(){}, recolor(){}, select(){}};
    }
    const css = () => getComputedStyle(document.documentElement);
    const col = name => new THREE.Color(css().getPropertyValue(name).trim() || '#888');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.1, 50);
    camera.position.set(0, -0.1, 4.0);
    camera.lookAt(0, -0.1, 0);
    const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    renderer.setClearColor(0x000000, 0);  // transparent: the panel colour shows through
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    const root = new THREE.Group();
    root.rotation.set(0.12, -0.5, 0);
    scene.add(root);

    // --- faint mesh that gives the brain its shape ---
    const mp = meshPoints();
    const me = nearestEdges(mp, 3);
    const meshGeo = new THREE.BufferGeometry();
    meshGeo.setAttribute('position', new THREE.Float32BufferAttribute(me.flatMap(([a, b]) => [...mp[a], ...mp[b]]), 3));
    const meshMat = new THREE.LineBasicMaterial({transparent: true, opacity: 0.32});
    root.add(new THREE.LineSegments(meshGeo, meshMat));
    const dotGeo = new THREE.SphereGeometry(0.014, 8, 6);
    const dotMat = new THREE.MeshBasicMaterial({transparent: true, opacity: 0.55});
    mp.forEach(p => { const m = new THREE.Mesh(dotGeo, dotMat); m.position.set(...p); root.add(m); });

    // --- real grid nodes ---
    const nodes = [];  // {key, name, kind, pos, mesh, r, glow}
    const add = (key, name, kind, pos, r) => { const n = {key, name, kind, pos, r}; nodes.push(n); return n; };
    const grid = add('g', CFG.grid, 'grid', STEM.bottom, 0.075);
    const subs = CFG.regions.map((reg, ri) => add('s' + ri, reg.substation, 'sub', ANCHORS[ri], 0.058));
    const areaNodes = CFG.areas.map(a => {
      const sibs = CFG.areas.filter(b => b.region === a.region), i = sibs.indexOf(a);
      const d = fib(sibs.length + 2, i + 1), anc = ANCHORS[a.region];
      return add('a' + a.id, a.name, 'area', clampInside(anc.map((v, k) => v + d[k] * [0.45, 0.36, 0.62][k]), 0.9), 0.036);
    });
    const placeNodes = CFG.loads.map(l => {
      const sibs = CFG.loads.filter(m => m.area === l.area), i = sibs.indexOf(l), ap = areaNodes[l.area].pos;
      const out = ap.map((v, k) => v - CEREBRUM.c[k]), len = Math.hypot(...out) || 1;
      const d = fib(sibs.length + 1, i);
      const p = ap.map((v, k) => v + out[k] / len * 0.1 + d[k] * 0.14);
      return add('p' + l.id, l.name, l.essential ? 'lock' : 'place', clampInside(p, 1.04), l.essential ? 0.026 : 0.022);
    });
    const edges = [];  // [parent, child]
    subs.forEach(s => edges.push([grid, s]));
    areaNodes.forEach((a, i) => edges.push([subs[CFG.areas[i].region], a]));
    placeNodes.forEach((p, i) => edges.push([areaNodes[CFG.loads[i].area], p]));

    const sphere = new THREE.SphereGeometry(1, 16, 12);
    nodes.forEach(n => {
      n.mesh = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({color: 0x888888}));
      n.mesh.scale.setScalar(n.r); n.mesh.position.set(...n.pos); n.mesh.userData.node = n;
      root.add(n.mesh);
    });

    // glow sprites (surge warning), shed rings and the selection ring
    const tex = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); return t; };
    const glowTex = tex(g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    const ringTex = tex(g => { g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke(); });
    nodes.forEach(n => {
      n.glow = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      n.glow.position.copy(n.mesh.position); n.glow.visible = false; root.add(n.glow);
      n.ring = new THREE.Sprite(new THREE.SpriteMaterial({map: ringTex, transparent: true, depthWrite: false}));
      n.ring.position.copy(n.mesh.position); n.ring.scale.setScalar(n.r * 3.2); n.ring.visible = false; root.add(n.ring);
    });
    const selRing = new THREE.Sprite(new THREE.SpriteMaterial({map: ringTex, transparent: true, depthWrite: false}));
    selRing.visible = false; root.add(selRing);

    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edges.flatMap(([a, b]) => [...a.pos, ...b.pos]), 3));
    const edgeCol = new Float32Array(edges.length * 6);
    edgeGeo.setAttribute('color', new THREE.BufferAttribute(edgeCol, 3));
    root.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({vertexColors: true, transparent: true, opacity: 0.85})));

    // HTML labels for the in-feed and the substations
    const labels = [grid, ...subs].map(n => { const el = document.createElement('div'); el.className = 'label' + (n === grid ? ' grid' : ''); el.textContent = n.name.replace(/ substation$/, ''); container.appendChild(el); return {n, el}; });

    // --- colouring ---
    let palette = {}, lastState = null, selected = null;
    function recolor(){
      palette = {line: col('--b-line'), mesh: col('--b-mesh'), node: col('--b-node'), cool: col('--b-cool'), warm: col('--b-warm'),
        hot: col('--b-hot'), lock: col('--b-lock'), shed: col('--b-shed'), bad: col('--bad'), accent: col('--accent')};
      meshMat.color.copy(palette.mesh); dotMat.color.copy(palette.mesh);
      selRing.material.color.copy(palette.accent);
      if (lastState) update(lastState);
    }
    function heat(change){
      const t = Math.max(0, Math.min(1, change / CFG.surge_alert));
      return t < 0.5 ? palette.cool.clone().lerp(palette.warm, t * 2) : palette.warm.clone().lerp(palette.hot, (t - 0.5) * 2);
    }
    function update(S){
      lastState = S;
      const sum = (ids, arr) => ids.reduce((a, i) => a + arr[i], 0);
      const byArea = CFG.areas.map(a => CFG.loads.filter(l => l.area === a.id).map(l => l.id));
      const byReg = CFG.regions.map((r, ri) => CFG.loads.filter(l => l.region === ri).map(l => l.id));
      const all = CFG.loads.map(l => l.id);
      const setNode = (n, ids, state) => {
        const now = sum(ids, S.now), pred = sum(ids, S.pred), change = pred / now - 1;
        n.change = change; n.nowMW = now; n.predMW = pred; n.state = state;
        const c = state === 'off' ? palette.shed : state === 'lock' ? palette.lock : heat(change);
        n.mesh.material.color.copy(c); n.color = c;
        n.surge = state !== 'off' && change >= CFG.surge_alert;
        n.glow.material.color.copy(state === 'lock' ? palette.lock : palette.hot);
        n.glow.visible = n.surge;
        n.ring.material.color.copy(palette.bad); n.ring.visible = state === 'off';
      };
      setNode(grid, all, 'on');
      subs.forEach((s, ri) => setNode(s, byReg[ri], 'on'));
      areaNodes.forEach((a, ai) => setNode(a, byArea[ai], byArea[ai].some(i => S.relays[i]) ? 'on' : 'off'));
      placeNodes.forEach((p, i) => setNode(p, [i], CFG.loads[i].essential ? 'lock' : S.relays[i] ? 'on' : 'off'));
      edges.forEach(([a, b], k) => {
        const c = b.state === 'off' ? palette.shed : b.color.clone().lerp(palette.line, b.kind === 'place' || b.kind === 'lock' ? 0.15 : 0.35);
        edgeCol.set([c.r, c.g, c.b, c.r, c.g, c.b], k * 6);
      });
      edgeGeo.attributes.color.needsUpdate = true;
    }

    function select(key){
      selected = nodes.find(n => n.key === key) || null;
      selRing.visible = !!selected;
      if (selected){ selRing.position.copy(selected.mesh.position); selRing.scale.setScalar(selected.r * 4.2); }
    }

    // --- interaction: drag to turn, hover for details, tap to select ---
    const tip = container.querySelector('.tooltip');
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    let drag = null, idleUntil = 0;
    const pick = e => {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(nodes.map(n => n.mesh))[0];
      return hit ? hit.object.userData.node : null;
    };
    const fmt = v => Math.round(v).toLocaleString('en-IN');
    renderer.domElement.addEventListener('pointerdown', e => { drag = {x: e.clientX, y: e.clientY, rx: root.rotation.x, ry: root.rotation.y, moved: false}; renderer.domElement.setPointerCapture(e.pointerId); });
    renderer.domElement.addEventListener('pointermove', e => {
      if (drag){
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        root.rotation.y = drag.ry + dx * 0.008; root.rotation.x = Math.max(-0.9, Math.min(0.9, drag.rx + dy * 0.006));
        idleUntil = performance.now() + 4000; tip.hidden = true; return;
      }
      const n = pick(e);
      if (!n || n.nowMW == null){ tip.hidden = true; return; }
      const r = container.getBoundingClientRect();
      const status = n.state === 'off' ? 'Switched off' : n.state === 'lock' ? 'Essential, locked ON' : 'ON';
      const ch = (n.change * 100).toFixed(1);
      tip.innerHTML = `<b>${n.name}</b><span>Now ${fmt(n.nowMW)} MW</span><span>In 30 min ${fmt(n.predMW)} MW (${ch >= 0 ? '+' : ''}${ch}%)</span><span>${status}</span>`;
      tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 240) + 'px';
      tip.style.top = (e.clientY - r.top + 14) + 'px';
      tip.hidden = false;
    });
    renderer.domElement.addEventListener('pointerup', e => {
      if (drag && !drag.moved){ const n = pick(e); if (n){ select(n.key); onSelect(n.key); } }
      drag = null;
    });
    renderer.domElement.addEventListener('pointerleave', () => { tip.hidden = true; });

    // --- sizing and the animation loop ---
    function resize(){
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      camera.position.z = w / h < 1 ? 5.2 : 4.0;
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(container); resize();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const v = new THREE.Vector3();
    function frame(t){
      if (!drag && !reduce && t > idleUntil) root.rotation.y += 0.0022;
      const pulse = 1 + 0.35 * Math.sin(t / 220);
      nodes.forEach(n => { if (n.glow.visible) n.glow.scale.setScalar(n.r * 7 * (reduce ? 1 : pulse)); });
      if (selected) selRing.scale.setScalar(selected.r * (4 + (reduce ? 0 : 0.6 * Math.sin(t / 300))));
      renderer.render(scene, camera);
      const w = container.clientWidth, h = container.clientHeight;
      labels.forEach(({n, el}) => {
        n.mesh.getWorldPosition(v); v.project(camera);
        el.style.left = ((v.x + 1) / 2 * w) + 'px'; el.style.top = ((1 - v.y) / 2 * h) + 'px';
      });
      requestAnimationFrame(frame);
    }
    recolor();
    requestAnimationFrame(frame);
    return {update, recolor, select};
  }
  return {create};
})();
