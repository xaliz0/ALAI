"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Memory, MemoryCategory } from "@/lib/types";

export const CATEGORY_COLOR: Record<MemoryCategory, string> = {
  fakt: "#5ee7ff",
  ereignis: "#ec4899",
  vorliebe: "#fbbf24",
  person: "#34d399",
  ziel: "#a78bfa",
};

// Each category lives in its own "lobe" of the holographic brain.
const LOBE: Record<MemoryCategory, [number, number, number]> = {
  fakt: [0, 0.15, 0.75],
  ereignis: [0, 0.1, -0.7],
  vorliebe: [-0.62, 0.3, 0],
  person: [0.62, 0.3, 0],
  ziel: [0, 0.68, 0.05],
};

function hash(str: string, seed: number) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function memoryPosition(m: Memory): THREE.Vector3 {
  const [x, y, z] = LOBE[m.category] ?? [0, 0, 0];
  const u = hash(m.id, 1) * Math.PI * 2;
  const v = Math.acos(2 * hash(m.id, 2) - 1);
  const r = 0.12 + 0.28 * Math.cbrt(hash(m.id, 3));
  return new THREE.Vector3(x + r * Math.sin(v) * Math.cos(u), y + r * 0.8 * Math.cos(v), z + r * Math.sin(v) * Math.sin(u));
}

/** Points scattered over two wrinkled hemispheres plus cerebellum: the holo "shell". */
function brainShell(count: number) {
  const pos: number[] = [];
  const col: number[] = [];
  const a = new THREE.Color("#5ee7ff");
  const b = new THREE.Color("#8b5cf6");
  for (let i = 0; i < count; i++) {
    const cerebellum = i % 9 === 0;
    const side = i % 2 ? 1 : -1;
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(2 * Math.random() - 1);
    const folds = 1 + 0.07 * Math.sin(9 * u) * Math.sin(7 * v);
    let p: THREE.Vector3;
    if (cerebellum) {
      p = new THREE.Vector3(0.42 * Math.sin(v) * Math.cos(u) * folds, -0.48 + 0.2 * Math.cos(v), -0.62 + 0.28 * Math.sin(v) * Math.sin(u));
    } else {
      p = new THREE.Vector3(
        side * 0.5 + 0.55 * Math.sin(v) * Math.cos(u) * folds,
        0.12 + 0.62 * Math.cos(v) * folds,
        1.0 * Math.sin(v) * Math.sin(u) * folds,
      );
      if (p.y < -0.3) p.y = -0.3 + (p.y + 0.3) * 0.3; // flatten the underside
      if (Math.sign(p.x) !== side) p.x *= 0.15; // keep the hemispheres apart
    }
    pos.push(p.x, p.y, p.z);
    const c = a.clone().lerp(b, (p.y + 0.6) / 1.4);
    col.push(c.r, c.g, c.b);
  }
  return { pos, col };
}

const VERT = `
attribute float size;
attribute vec3 color;
varying vec3 vColor;
uniform float uPixel;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uPixel * (3.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying vec3 vColor;
uniform float uOpacity;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a + smoothstep(0.12, 0.0, d);
  gl_FragColor = vec4(vColor, a * uOpacity);
}`;

function glowMaterial(opacity: number, pixel: number) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uOpacity: { value: opacity }, uPixel: { value: pixel } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

interface Props {
  memories: Memory[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function BrainHolo({ memories, selectedId, onSelect }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const api = useRef<{
    setMemories: (m: Memory[]) => void;
    setSelected: (id: string | null) => void;
  } | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05050b, 0.18);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(2.6, 1.1, 2.9);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;
    controls.minDistance = 1.8;
    controls.maxDistance = 7;
    controls.enablePan = false;
    controls.target.set(0, 0.05, 0);

    const holo = new THREE.Group();
    scene.add(holo);

    // Holographic shell
    const shell = brainShell(2600);
    const shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute("position", new THREE.Float32BufferAttribute(shell.pos, 3));
    shellGeo.setAttribute("color", new THREE.Float32BufferAttribute(shell.col, 3));
    shellGeo.setAttribute("size", new THREE.Float32BufferAttribute(shell.pos.map(() => 0.9 + Math.random() * 0.9).slice(0, shell.pos.length / 3), 1));
    const shellMat = glowMaterial(0.55, dpr * 8);
    holo.add(new THREE.Points(shellGeo, shellMat));

    // Core
    const coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.15, 0], 3));
    coreGeo.setAttribute("color", new THREE.Float32BufferAttribute([1, 1, 1], 3));
    coreGeo.setAttribute("size", new THREE.Float32BufferAttribute([14], 1));
    const coreMat = glowMaterial(0.9, dpr * 8);
    holo.add(new THREE.Points(coreGeo, coreMat));

    // Projector base + scan ring
    const base = new THREE.Group();
    base.position.y = -0.95;
    for (let i = 1; i <= 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.28 * i, 0.28 * i + 0.012, 96),
        new THREE.MeshBasicMaterial({ color: 0x5ee7ff, transparent: true, opacity: 0.5 / i, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
      );
      ring.rotation.x = -Math.PI / 2;
      base.add(ring);
    }
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 0.35, 1.9, 48, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x5ee7ff, transparent: true, opacity: 0.035, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    beam.position.y = 0.95;
    base.add(beam);
    scene.add(base);

    const scan = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.17, 96),
      new THREE.MeshBasicMaterial({ color: 0x8be9ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    scan.rotation.x = -Math.PI / 2;
    scene.add(scan);

    // Memory nodes + links (rebuilt on change)
    let nodes: THREE.Points | null = null;
    let links: THREE.LineSegments | null = null;
    let current: Memory[] = [];
    let selected: string | null = null;
    const nodeMat = glowMaterial(1, dpr * 8);
    const linkMat = new THREE.LineBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });

    const baseSize = (m: Memory) => (m.id === selected ? 30 : 15);

    const setMemories = (list: Memory[]) => {
      current = list;
      if (nodes) {
        holo.remove(nodes);
        nodes.geometry.dispose();
      }
      if (links) {
        holo.remove(links);
        links.geometry.dispose();
      }
      const positions = list.map(memoryPosition);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions.flatMap((p) => p.toArray()), 3));
      g.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(list.flatMap((m) => new THREE.Color(CATEGORY_COLOR[m.category] ?? "#fff").toArray()), 3),
      );
      g.setAttribute("size", new THREE.Float32BufferAttribute(list.map(baseSize), 1));
      nodes = new THREE.Points(g, nodeMat);
      holo.add(nodes);

      // Every memory links to the core, plus its two nearest neighbours.
      const seg: number[] = [];
      positions.forEach((p, i) => {
        seg.push(0, 0.15, 0, p.x, p.y, p.z);
        positions
          .map((q, j) => ({ j, d: p.distanceToSquared(q) }))
          .filter((o) => o.j !== i)
          .sort((x, y) => x.d - y.d)
          .slice(0, 2)
          .forEach(({ j }) => seg.push(p.x, p.y, p.z, positions[j].x, positions[j].y, positions[j].z));
      });
      const lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
      links = new THREE.LineSegments(lg, linkMat);
      holo.add(links);
    };

    const setSelected = (id: string | null) => {
      selected = id;
      if (!nodes) return;
      const attr = nodes.geometry.getAttribute("size") as THREE.BufferAttribute;
      current.forEach((m, i) => attr.setX(i, baseSize(m)));
      attr.needsUpdate = true;
      if (id) controls.autoRotate = false;
    };

    api.current = { setMemories, setSelected };

    // Hover + click picking
    const ray = new THREE.Raycaster();
    ray.params.Points = { threshold: 0.06 };
    const mouse = new THREE.Vector2();
    let hovered = -1;
    let downAt = { x: 0, y: 0 };

    const pick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = nodes ? ray.intersectObject(nodes)[0] : undefined;
      return hit?.index ?? -1;
    };
    const onMove = (e: PointerEvent) => {
      hovered = pick(e);
      const tip = tipRef.current!;
      if (hovered >= 0) {
        const m = current[hovered];
        const r = mount.getBoundingClientRect();
        tip.textContent = m.text;
        tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
        tip.style.opacity = "1";
        tip.style.borderColor = CATEGORY_COLOR[m.category];
        renderer.domElement.style.cursor = "pointer";
      } else {
        tip.style.opacity = "0";
        renderer.domElement.style.cursor = "grab";
      }
    };
    const onDown = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return; // that was a drag
      const i = pick(e);
      onSelectRef.current(i >= 0 ? current[i].id : null);
      if (i < 0) controls.autoRotate = true;
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let frame = 0;
    const clock = new THREE.Clock();
    const loop = () => {
      const t = clock.getElapsedTime();
      shellMat.uniforms.uOpacity.value = 0.45 + 0.08 * Math.sin(t * 2.1) + (Math.random() < 0.01 ? -0.2 : 0); // holo flicker
      coreMat.uniforms.uOpacity.value = 0.7 + 0.3 * Math.sin(t * 3);
      scan.position.y = -0.85 + ((Math.sin(t * 0.7) + 1) / 2) * 1.9;
      const s = 1 - Math.abs(scan.position.y - 0.05) * 0.35;
      scan.scale.setScalar(Math.max(0.3, s));
      if (nodes && selected) {
        const i = current.findIndex((m) => m.id === selected);
        const attr = nodes.geometry.getAttribute("size") as THREE.BufferAttribute;
        if (i >= 0) {
          attr.setX(i, 26 + 8 * Math.sin(t * 6));
          attr.needsUpdate = true;
        }
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const obj = o as THREE.Mesh;
        obj.geometry?.dispose();
        const mat = obj.material as THREE.Material | undefined;
        mat?.dispose?.();
      });
      mount.removeChild(renderer.domElement);
      api.current = null;
    };
  }, []);

  useEffect(() => {
    api.current?.setMemories(memories);
    api.current?.setSelected(selectedId);
  }, [memories, selectedId]);

  return (
    <div className="holo" ref={mountRef}>
      <div className="holo-tip" ref={tipRef} />
    </div>
  );
}
