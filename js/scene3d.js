import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { Brush, Evaluator, SUBTRACTION, INTERSECTION, ADDITION } from "three-bvh-csg";
import { multiKey } from "./keys.js";
import { capHist } from "./hist.js";

const GOLD = 0xc6a53a;
const MAT = { color: GOLD, metalness: 0.18, roughness: 0.38, side: THREE.FrontSide };

const CAM0 = [8, 6.2, 8];
const TARGET0 = [0, 0.6, 0];
const SNAP_K = 0.08;
const SNAP_E = 0.05;

export function createScene3D(container, { onChange } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);
  scene.fog = new THREE.Fog(0x0a0a0a, 22, 48);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 200);
  camera.position.set(8, 6.2, 8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.06;
  orbit.target.set(0, 0.6, 0);
  orbit.maxPolarAngle = Math.PI * 0.49;
  orbit.minDistance = 2;
  orbit.maxDistance = 40;
  orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

  scene.add(new THREE.HemisphereLight(0xf3e7b8, 0x12100a, 0.7));
  scene.add(new THREE.AmbientLight(GOLD, 0.12));
  const key = new THREE.DirectionalLight(0xfff6d8, 1.15);
  key.position.set(7, 12, 5);
  key.castShadow = true;
  scene.add(key);
  scene.add(new THREE.DirectionalLight(0x8a7a4a, 0.35).translateX(-6).translateY(4).translateZ(-4));

  const grid = new THREE.GridHelper(24, 24, 0x9a812c, 0x1c1c1c);
  const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
  gridMats.forEach((m) => { m.transparent = true; m.opacity = 0.85; });
  scene.add(grid);
  const axes = new THREE.AxesHelper(1.6).translateY(0.02);
  scene.add(axes);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(12, 64),
    new THREE.MeshStandardMaterial({ color: 0x101010, metalness: 0.1, roughness: 0.9 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = "__ground";
  scene.add(ground);

  const group = new THREE.Group();
  scene.add(group);

  const transform = new TransformControls(camera, renderer.domElement);
  transform.setSize(0.85);
  transform.setSpace("world");
  orbit.addEventListener("change", kick);
  transform.addEventListener("change", kick);
  transform.addEventListener("dragging-changed", (e) => {
    orbit.enabled = !e.value;
    kick();
    if (e.value) pendingXform = true;
    else if (pendingXform) {
      pendingXform = false;
      pushHist();
      notify();
    }
  });
  scene.add(typeof transform.getHelper === "function" ? transform.getHelper() : transform);

  const overlay = new THREE.Group();
  scene.add(overlay);

  let selected = null;
  let picked = [];
  let slot = 0;
  let raf = 0;
  let running = true;
  let xformMode = "translate";
  let editMode = "object";
  let faceSel = null;
  let vertSel = null;
  let drag = null;
  let hist = [];
  let histI = -1;
  let pendingXform = false;
  let pendingEdit = false;
  let gridOn = true;
  let snapOn = false;

  function notify() {
    kick();
    onChange?.();
  }

  let live = 0;
  function kick() {
    if (!running) return;
    live = 18;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function setPaused(on) {
    running = !on;
    if (on) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else kick();
  }

  function solids() {
    return group.children.filter((o) => o.isMesh && o.name !== "__ground");
  }

  function capture() {
    return solids().map((mesh) => ({
      type: mesh.userData.type,
      position: mesh.position.toArray(),
      quaternion: mesh.quaternion.toArray(),
      scale: mesh.scale.toArray(),
      color: mesh.material.color.getHex(),
      positions: Array.from(mesh.geometry.attributes.position.array),
      bindLocal: Array.from(mesh.userData.bindLocal || mesh.geometry.attributes.position.array),
    }));
  }

  function clearSolids() {
    transform.detach();
    selected = null;
    picked = [];
    faceSel = null;
    vertSel = null;
    hideGhost();
    clearOverlay();
    showFaceWheel(false);
    for (const mesh of solids().slice()) {
      group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  function spawnItem(item) {
    const want = item.positions || [];
    let geo;
    const proto = item.type === "merge" ? null : geom(item.type);
    if (!proto || proto.attributes.position.array.length !== want.length) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(want, 3));
    } else {
      geo = proto;
      geo.attributes.position.array.set(want);
      geo.attributes.position.needsUpdate = true;
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ ...MAT, color: item.color }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.type = item.type;
    mesh.position.fromArray(item.position);
    mesh.quaternion.fromArray(item.quaternion);
    mesh.scale.fromArray(item.scale);
    mesh.userData.bindLocal = (item.bindLocal || want).slice();
    group.add(mesh);
    return mesh;
  }

  function copySelected() {
    return picked.map((mesh) => ({
      type: mesh.userData.type,
      position: mesh.position.toArray(),
      quaternion: mesh.quaternion.toArray(),
      scale: mesh.scale.toArray(),
      color: mesh.material.color.getHex(),
      positions: Array.from(mesh.geometry.attributes.position.array),
      bindLocal: Array.from(mesh.userData.bindLocal || mesh.geometry.attributes.position.array),
    }));
  }

  function pasteItems(data) {
    if (!data?.length) return;
    select(null);
    const meshes = data.map((it) => spawnItem(it));
    meshes.forEach((m) => select(m, true));
    slot = solids().length;
    pushHist();
    notify();
  }

  function restore(items, selectLast = false) {
    clearSolids();
    items.forEach((it) => spawnItem(it));
    slot = solids().length;
    if (selectLast && solids().length) select(solids()[solids().length - 1]);
    else select(null);
  }

  function pushHist() {
    hist = hist.slice(0, histI + 1);
    hist.push(capture());
    const cap = capHist(hist, hist.length - 1);
    hist = cap.list;
    histI = cap.index;
  }

  function undo() {
    if (histI <= 0) return;
    histI--;
    restore(hist[histI]);
    notify();
  }

  function redo() {
    if (histI >= hist.length - 1) return;
    histI++;
    restore(hist[histI]);
    notify();
  }

  function geom(type) {
    if (type === "sphere") return new THREE.SphereGeometry(0.7, 48, 32);
    if (type === "cylinder") return new THREE.CylinderGeometry(0.55, 0.55, 2.2, 48);
    if (type === "cone") return new THREE.ConeGeometry(0.7, 1.6, 48);
    return new THREE.BoxGeometry(1.2, 1.2, 1.2);
  }

  function addPrimitive(type) {
    const mesh = new THREE.Mesh(geom(type), new THREE.MeshStandardMaterial({ ...MAT }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.type = type;
    mesh.position.set((slot % 4) * 1.7, 0.7, Math.floor(slot / 4) * 1.7);
    storeBind(mesh);
    slot += 1;
    group.add(mesh);
    select(mesh);
    pushHist();
    notify();
    return mesh;
  }

  function storeBind(mesh) {
    mesh.userData.bindLocal = mesh.geometry.attributes.position.array.slice();
  }

  function restoreBind(mesh) {
    const bind = mesh.userData.bindLocal;
    if (!bind) return;
    mesh.geometry.attributes.position.array.set(bind);
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  function nearBind(mesh, eps = 0.014) {
    const bind = mesh.userData.bindLocal;
    if (!bind) return false;
    const arr = mesh.geometry.attributes.position.array;
    let err = 0;
    for (let i = 0; i < arr.length; i++) err += Math.abs(arr[i] - bind[i]);
    return err / arr.length < eps;
  }

  let ghost = null;
  function showGhost(mesh) {
    hideGhost();
    const g = mesh.geometry.clone();
    if (mesh.userData.bindLocal) g.attributes.position.array.set(mesh.userData.bindLocal);
    g.computeVertexNormals();
    ghost = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: GOLD, wireframe: true, transparent: true, opacity: 0.4, depthTest: true,
      })
    );
    ghost.name = "__ghost";
    ghost.raycast = () => {};
    mesh.add(ghost);
  }

  function hideGhost() {
    if (!ghost) return;
    ghost.removeFromParent();
    ghost.geometry.dispose();
    ghost.material.dispose();
    ghost = null;
  }

  function ndcFrom(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  function raycast(clientX, clientY, objs) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndcFrom(clientX, clientY), camera);
    return ray.intersectObjects(objs, false);
  }

  function localPos(mesh, i) {
    const p = mesh.geometry.attributes.position;
    return new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
  }

  function worldPos(mesh, i) {
    return mesh.localToWorld(localPos(mesh, i));
  }

  function setLocal(mesh, i, v) {
    const p = mesh.geometry.attributes.position;
    p.setXYZ(i, v.x, v.y, v.z);
    p.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  function weldIndices(mesh, index) {
    const a = localPos(mesh, index);
    const p = mesh.geometry.attributes.position;
    const out = [];
    for (let i = 0; i < p.count; i++) {
      if (localPos(mesh, i).distanceTo(a) < 1e-4) out.push(i);
    }
    return out;
  }

  function triangleIndices(mesh, faceIndex) {
    const geo = mesh.geometry;
    const i0 = faceIndex * 3;
    if (geo.index) {
      return [geo.index.getX(i0), geo.index.getX(i0 + 1), geo.index.getX(i0 + 2)];
    }
    return [i0, i0 + 1, i0 + 2];
  }

  function collectFace(mesh, faceIndex) {
    const tri = triangleIndices(mesh, faceIndex);
    const a = worldPos(mesh, tri[0]), b = worldPos(mesh, tri[1]), c = worldPos(mesh, tri[2]);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const planeD = n.dot(a);
    const geo = mesh.geometry;
    const triCount = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    const verts = new Set();
    for (let t = 0; t < triCount; t++) {
      const ids = triangleIndices(mesh, t);
      const pa = worldPos(mesh, ids[0]);
      const pb = worldPos(mesh, ids[1]);
      const pc = worldPos(mesh, ids[2]);
      const tn = new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa)).normalize();
      if (tn.dot(n) < 0.92) continue;
      if (Math.abs(n.dot(pa) - planeD) > 0.04) continue;
      ids.forEach((i) => verts.add(i));
    }
    const list = [...verts];
    const center = new THREE.Vector3();
    list.forEach((i) => center.add(worldPos(mesh, i)));
    center.multiplyScalar(1 / list.length);
    return { mesh, indices: list, normal: n, center, planeD };
  }

  function applyFaceDeform(k, extrude) {
    const mesh = faceSel.mesh;
    const n = faceSel.normal;
    const start = faceSel.startAll;
    const pos = mesh.geometry.attributes.position;
    if (snapOn) {
      if (Math.abs(k - 1) < SNAP_K) k = 1;
      if (Math.abs(extrude) < SNAP_E) extrude = 0;
    }
    k = Math.max(1, k);

    const tmp = new THREE.Vector3();
    const worlds = [];
    let tmin = Infinity, tmax = -Infinity;
    const pivot = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      tmp.fromArray(start, i * 3);
      const w = mesh.localToWorld(tmp.clone());
      worlds.push(w);
      pivot.add(w);
      const d = n.dot(w);
      if (d < tmin) tmin = d;
      if (d > tmax) tmax = d;
    }
    pivot.multiplyScalar(1 / pos.count);
    const span = Math.max(tmax - tmin, 1e-5);
    let faceDot = 0;
    faceSel.indices.forEach((i) => { faceDot += n.dot(worlds[i]); });
    faceDot /= faceSel.indices.length;
    const flip = faceDot < (tmin + tmax) * 0.5;

    for (let i = 0; i < pos.count; i++) {
      let t = (n.dot(worlds[i]) - tmin) / span;
      if (flip) t = 1 - t;
      const w0 = worlds[i];
      const rel = w0.clone().sub(pivot);
      const along = n.clone().multiplyScalar(rel.dot(n));
      const inplane = rel.sub(along);
      const w1 = pivot.clone()
        .add(along)
        .add(inplane.multiplyScalar(1 + (k - 1) * t))
        .addScaledVector(n, extrude * t);
      setLocal(mesh, i, mesh.worldToLocal(w1));
    }
    if (k === 1 && extrude === 0) restoreBind(mesh);
    faceSel.k = k;
    const c = new THREE.Vector3();
    faceSel.indices.forEach((i) => c.add(worldPos(mesh, i)));
    faceSel.center = c.multiplyScalar(1 / faceSel.indices.length);
  }

  function clearOverlay() {
    while (overlay.children.length) {
      const o = overlay.children[0];
      overlay.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    }
  }

  function drawFaceOverlay() {
    clearOverlay();
    if (!faceSel) return;
    const { mesh, indices, normal, center } = faceSel;
    const pts = indices.map((i) => worldPos(mesh, i));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const local = pts.map((p) => p.clone().sub(center).applyQuaternion(q.clone().invert()));
    local.sort((u, v) => Math.atan2(u.y, u.x) - Math.atan2(v.y, v.x));
    const shape = new THREE.Shape(local.map((p) => new THREE.Vector2(p.x, p.y)));
    const g = new THREE.ShapeGeometry(shape);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: GOLD, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthTest: false,
    }));
    m.quaternion.copy(q);
    m.position.copy(center).addScaledVector(normal, 0.01);
    m.renderOrder = 10;
    overlay.add(m);
    const arrow = new THREE.ArrowHelper(normal, center, 0.9, 0xc6a53a, 0.18, 0.12);
    overlay.add(arrow);
  }

  function drawVertDots(mesh) {
    clearOverlay();
    if (!mesh) return;
    const p = mesh.geometry.attributes.position;
    const seen = [];
    for (let i = 0; i < p.count; i++) {
      const w = worldPos(mesh, i);
      if (seen.some((s) => s.distanceTo(w) < 0.04)) continue;
      seen.push(w);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 12),
        new THREE.MeshBasicMaterial({
          color: vertSel?.index === i ? 0xffe08a : GOLD,
          depthTest: false,
        })
      );
      dot.position.copy(w);
      dot.userData.vertIndex = i;
      dot.renderOrder = 12;
      overlay.add(dot);
    }
  }

  function glow(mesh, on) {
    if (mesh?.material?.emissive) mesh.material.emissive.setHex(on ? 0x3a2e10 : 0x000000);
  }

  function select(mesh, add = false) {
    if (!add) {
      picked.forEach((m) => glow(m, false));
      picked = [];
      selected = null;
    }
    faceSel = null;
    vertSel = null;
    clearOverlay();
    hideGhost();
    showFaceWheel(false);
    if (!mesh || mesh.name === "__ground") {
      transform.detach();
      kick();
      return null;
    }
    const ix = picked.indexOf(mesh);
    if (add && ix >= 0) {
      glow(mesh, false);
      picked.splice(ix, 1);
      selected = picked[picked.length - 1] || null;
    } else if (!picked.includes(mesh)) {
      picked.push(mesh);
      selected = mesh;
      glow(mesh, true);
    } else selected = mesh;
    if (editMode === "object" && selected) {
      transform.attach(selected);
      transform.setMode(xformMode);
    } else {
      transform.detach();
      if (editMode === "vertex" && selected) drawVertDots(selected);
    }
    kick();
    return selected;
  }

  function setEditMode(mode) {
    editMode = mode;
    orbit.enabled = true;
    drag = null;
    if (mode === "object") {
      clearOverlay();
      hideGhost();
      faceSel = null;
      vertSel = null;
      showFaceWheel(false);
      if (selected) {
        transform.attach(selected);
        transform.setMode(xformMode);
      }
    } else {
      transform.detach();
      if (mode === "vertex" && selected) drawVertDots(selected);
      if (mode === "face") { faceSel = null; hideGhost(); clearOverlay(); showFaceWheel(false); }
    }
  }

  function pickObject(clientX, clientY, add = false) {
    if (transform.dragging && !add) return selected;
    const hits = raycast(clientX, clientY, solids());
    return select(hits[0]?.object || null, add);
  }

  function showFaceWheel(on) {
    const el = document.getElementById("face-wheel");
    const sl = document.getElementById("face-k");
    if (!el) return;
    el.hidden = !on;
    if (on && sl) sl.value = String(Math.round((((faceSel?.k ?? 1) - 1) / 1.6) * 100));
  }

  function kFromWheel(v) { return 1 + (Number(v) / 100) * 1.6; }

  document.getElementById("face-k")?.addEventListener("input", (e) => {
    if (!faceSel) return;
    applyFaceDeform(kFromWheel(e.target.value), 0);
    drawFaceOverlay();
  });
  document.getElementById("face-k")?.addEventListener("change", () => {
    if (!faceSel) return;
    pushHist();
    notify();
  });

  window.addEventListener("keydown", (e) => {
    if (multiKey(e)) transform.enabled = false;
  });
  window.addEventListener("keyup", (e) => {
    if (!e.metaKey && !e.ctrlKey) transform.enabled = true;
  });

  let skipPick = false;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (editMode !== "object" || e.button !== 0 || !multiKey(e)) return;
    const mesh = raycast(e.clientX, e.clientY, solids())[0]?.object;
    if (!mesh) return;
    e.stopImmediatePropagation();
    skipPick = true;
    select(mesh, true);
    notify();
  }, true);

  function pointerDown(e) {
    if (skipPick) { skipPick = false; return; }
    if (editMode === "object") {
      pickObject(e.clientX, e.clientY, multiKey(e));
      return;
    }
    if (editMode === "face") {
      const hits = raycast(e.clientX, e.clientY, group.children);
      if (!hits[0] || hits[0].faceIndex == null) { faceSel = null; clearOverlay(); showFaceWheel(false); return; }
      select(hits[0].object);
      transform.detach();
      faceSel = collectFace(hits[0].object, hits[0].faceIndex);
      faceSel.startAll = hits[0].object.geometry.attributes.position.array.slice();
      faceSel.k = 1;
      showGhost(hits[0].object);
      drawFaceOverlay();
      showFaceWheel(true);
      drag = {
        kind: e.altKey ? "extrude" : "fscale",
        mx: e.clientX, my: e.clientY,
      };
      orbit.enabled = false;
      pendingEdit = true;
      return;
    }
    if (editMode === "vertex") {
      const hits = raycast(e.clientX, e.clientY, overlay.children);
      const dot = hits[0]?.object;
      if (dot?.userData.vertIndex == null) {
        const mh = raycast(e.clientX, e.clientY, group.children);
        if (mh[0]) { select(mh[0].object); transform.detach(); drawVertDots(mh[0].object); }
        return;
      }
      vertSel = { mesh: selected, index: dot.userData.vertIndex };
      drag = { kind: "vert", mx: e.clientX, my: e.clientY, start: worldPos(selected, vertSel.index) };
      orbit.enabled = false;
      pendingEdit = true;
      drawVertDots(selected);
    }
  }

  function snapToOtherVertex(mesh, skipIndex, worldPt) {
    const thresh = 0.14;
    let best = null, bestD = thresh;
    const skip = new Set(weldIndices(mesh, skipIndex));
    solids().forEach((m) => {
      const p = m.geometry.attributes.position;
      const seen = [];
      for (let i = 0; i < p.count; i++) {
        if (m === mesh && skip.has(i)) continue;
        const w = worldPos(m, i);
        if (seen.some((s) => s.distanceTo(w) < 0.03)) continue;
        seen.push(w);
        const d = w.distanceTo(worldPt);
        if (d < bestD) { bestD = d; best = w; }
      }
    });
    return best;
  }

  function pointerMove(e) {
    if (!drag) return;
    if (drag.kind === "fscale" && faceSel) {
      const { mesh, normal, center } = faceSel;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center);
      const ray = new THREE.Raycaster();
      const now = new THREE.Vector3();
      const was = new THREE.Vector3();
      ray.setFromCamera(ndcFrom(e.clientX, e.clientY), camera);
      if (!ray.ray.intersectPlane(plane, now)) return;
      ray.setFromCamera(ndcFrom(drag.mx, drag.my), camera);
      if (!ray.ray.intersectPlane(plane, was)) return;
      const d0 = Math.max(was.distanceTo(center), 0.05);
      applyFaceDeform(now.distanceTo(center) / d0, 0);
      drawFaceOverlay();
      const sl = document.getElementById("face-k");
      if (sl && faceSel) sl.value = String(Math.max(0, Math.round((((faceSel.k ?? 1) - 1) / 1.6) * 100)));
      return;
    }
    if (drag.kind === "extrude" && faceSel) {
      applyFaceDeform(1, (drag.my - e.clientY) * 0.008);
      drawFaceOverlay();
      return;
    }
    if (drag.kind === "vert" && vertSel) {
      const mesh = vertSel.mesh;
      const camN = new THREE.Vector3();
      camera.getWorldDirection(camN);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camN.negate(), drag.start);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndcFrom(e.clientX, e.clientY), camera);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return;
      const snapped = snapToOtherVertex(mesh, vertSel.index, hit);
      const dest = snapped || hit;
      weldIndices(mesh, vertSel.index).forEach((i) => setLocal(mesh, i, mesh.worldToLocal(dest.clone())));
      drawVertDots(mesh);
    }
  }

  function pointerUp() {
    drag = null;
    orbit.enabled = true;
    if (faceSel) {
      faceSel.startAll = faceSel.mesh.geometry.attributes.position.array.slice();
      if (snapOn && nearBind(faceSel.mesh)) restoreBind(faceSel.mesh);
    }
    if (pendingEdit) {
      pendingEdit = false;
      pushHist();
      notify();
    }
  }

  function setXform(mode) {
    xformMode = mode;
    if (editMode === "object") transform.setMode(mode);
  }

  function setColor(hex) {
    if (!picked.length) return;
    picked.forEach((m) => m.material.color.set(hex));
    pushHist();
    notify();
  }

  function removeSelected() {
    if (!picked.length) return;
    transform.detach();
    picked.slice().forEach((mesh) => {
      group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    picked = [];
    selected = null;
    faceSel = null;
    vertSel = null;
    hideGhost();
    clearOverlay();
    showFaceWheel(false);
    pushHist();
    notify();
  }

  function meshWorldGeo(mesh) {
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    return g;
  }

  function toBrush(mesh) {
    const b = new Brush(meshWorldGeo(mesh), mesh.material.clone());
    b.position.set(0, 0, 0);
    b.quaternion.identity();
    b.scale.set(1, 1, 1);
    b.updateMatrixWorld(true);
    return b;
  }

  function bakeBrush(result) {
    result.updateMatrixWorld(true);
    const g = result.geometry.clone();
    g.applyMatrix4(result.matrixWorld);
    g.computeVertexNormals();
    g.computeBoundingBox();
    const c = new THREE.Vector3();
    g.boundingBox.getCenter(c);
    g.translate(-c.x, -c.y, -c.z);
    g.computeBoundingSphere();
    return { geo: g, center: c };
  }

  function booleanGeoms(meshes, op) {
    const csgOp = op === "union" ? ADDITION : op === "inter" ? INTERSECTION : SUBTRACTION;
    const body = meshes[meshes.length - 1];
    const others = meshes.slice(0, -1);
    const evalr = new Evaluator();
    evalr.useGroups = false;
    let acc = toBrush(body);
    for (const other of others) {
      acc = evalr.evaluate(acc, toBrush(other), csgOp);
    }
    if (!acc?.geometry?.attributes?.position?.count) return null;
    return bakeBrush(acc);
  }

  function snapshotMesh(mesh) {
    return {
      type: mesh.userData.type,
      position: mesh.position.toArray(),
      quaternion: mesh.quaternion.toArray(),
      scale: mesh.scale.toArray(),
      color: mesh.material.color.getHex(),
      positions: Array.from(mesh.geometry.attributes.position.array),
      bindLocal: Array.from(mesh.userData.bindLocal || mesh.geometry.attributes.position.array),
    };
  }

  function mergeSelected(op) {
    if (op === "split") {
      const m = selected;
      if (!m?.userData.parts?.length) return "split";
      transform.detach();
      const parts = m.userData.parts;
      group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      picked = [];
      const spawned = parts.map((it) => spawnItem(it));
      spawned.forEach((mesh, i) => select(mesh, i > 0));
      slot = solids().length;
      pushHist();
      notify();
      return "split-ok";
    }
    const targets = picked.length >= 2 ? picked.slice() : (op === "union" ? solids() : []);
    if (targets.length < 2) return "need";
    if (!["union", "sub", "inter"].includes(op)) return "soon";
    const body = targets[targets.length - 1];
    const color = body.material.color.getHex();
    let built;
    try {
      built = booleanGeoms(targets, op);
    } catch (err) {
      console.error(err);
      return "empty";
    }
    if (!built) return "empty";
    const parts = targets.map(snapshotMesh);
    transform.detach();
    const mesh = new THREE.Mesh(built.geo, new THREE.MeshStandardMaterial({
      ...MAT, color, side: THREE.FrontSide,
    }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.type = "merge";
    mesh.userData.parts = parts;
    mesh.position.copy(built.center);
    storeBind(mesh);
    targets.forEach((m) => {
      group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    group.add(mesh);
    picked = [];
    select(mesh);
    pushHist();
    notify();
    return "ok";
  }

  function setGrid(on) {
    gridOn = on;
    grid.visible = on;
    axes.visible = on;
  }

  function setSnap(on) {
    snapOn = on;
    transform.setTranslationSnap(on ? 0.25 : null);
    transform.setRotationSnap(on ? Math.PI / 12 : null);
    transform.setScaleSnap(on ? 0.1 : null);
  }

  function zoomBy(factor) {
    const offset = camera.position.clone().sub(orbit.target);
    offset.multiplyScalar(factor);
    const dist = offset.length();
    if (dist < orbit.minDistance || dist > orbit.maxDistance) return;
    camera.position.copy(orbit.target).add(offset);
    orbit.update();
  }

  function zoomFit() {
    camera.position.set(...CAM0);
    orbit.target.set(...TARGET0);
    orbit.update();
  }

  function zoomLabel() {
    const d0 = new THREE.Vector3(...CAM0).distanceTo(new THREE.Vector3(...TARGET0));
    const d = camera.position.distanceTo(orbit.target);
    return `${Math.round((d0 / d) * 100)}%`;
  }

  function reset() {
    clearSolids();
    slot = 0;
    hist = [];
    histI = -1;
    zoomFit();
    pushHist();
    notify();
  }

  function exportPng() {
    renderer.render(scene, camera);
    const a = document.createElement("a");
    a.download = "modello.png";
    a.href = renderer.domElement.toDataURL("image/png");
    a.click();
  }

  function serialize() {
    return { slot, meshes: capture(), camera: camera.position.toArray(), target: orbit.target.toArray(), grid: gridOn, snap: snapOn };
  }

  function load(data) {
    if (!data) return;
    restore(data.meshes || []);
    if (data.camera) camera.position.fromArray(data.camera);
    if (data.target) orbit.target.fromArray(data.target);
    slot = data.slot ?? solids().length;
    setGrid(data.grid !== false);
    setSnap(!!data.snap);
    orbit.update();
    hist = [capture()];
    histI = 0;
    notify();
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (w < 2 || h < 2) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    kick();
  }

  function tick() {
    if (!running) { raf = 0; return; }
    orbit.update();
    renderer.render(scene, camera);
    live -= 1;
    if (transform.dragging || drag || live > 0) raf = requestAnimationFrame(tick);
    else raf = 0;
  }

  function dispose() {
    running = false;
    cancelAnimationFrame(raf);
    transform.detach();
    transform.dispose();
    orbit.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  new ResizeObserver(resize).observe(container);
  resize();
  pushHist();
  kick();

  return {
    addPrimitive,
    pick: pickObject,
    pointerDown,
    pointerMove,
    pointerUp,
    setXform,
    setEditMode,
    setColor,
    removeSelected,
    setGrid,
    setSnap,
    zoomBy,
    zoomFit,
    zoomLabel,
    setPaused,
    reset,
    exportPng,
    serialize,
    load,
    undo,
    redo,
    resize,
    dispose,
    mergeSelected,
    copySelected,
    pasteItems,
    get selected() { return selected; },
    get selectedCount() { return picked.length; },
    get count() { return solids().length; },
    get mode() { return xformMode; },
    get editMode() { return editMode; },
    get hasFace() { return !!faceSel; },
    get grid() { return gridOn; },
    get snap() { return snapOn; },
  };
}
