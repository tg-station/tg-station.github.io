// 라인업 카드 360° 보기: 제품 GLB를 카드 안에서 드래그로 돌려 보는 뷰어
// CAD 원본에 재질 정보가 없어서, 노드 이름(n0~n46)별로 사진(tg-a.png)을 보고 재질을 입힙니다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const VIEW = {
  START_YAW: 0.62,       // 처음 각도 (사진처럼 왼쪽 측면이 보이게)
  START_PITCH: 0.16,
  PITCH_LIMIT: 0.45,     // 위아래로 기울일 수 있는 최대 각도
  DRAG_SPEED: 0.009,
  AUTO_SPEED: 0.35,      // 손 떼고 있을 때 자동 회전 속도 (rad/s)
  AUTO_DELAY: 2200,      // 손 뗀 뒤 자동 회전 시작까지 (ms)
  FOV: 26,
  FILL: 1.18             // 카메라 거리 배율 (클수록 모델이 작게)
};

// 부위별 재질 지정 (S1)
const PARTS = {
  silver: ['n0', 'n1', 'n5', 'n8', 'n14', 'n15', 'n16', 'n17', 'n18'],
  dark: ['n2', 'n3', 'n4', 'n6', 'n10', 'n11', 'n12', 'n13', 'n20', 'n21', 'n45', 'n46'],
  print: ['n7', 'n9', 'n22', 'n23', 'n24', 'n25', 'n26', 'n27', 'n28', 'n29', 'n30', 'n31', 'n32', 'n33',
          'n34', 'n35', 'n36', 'n37', 'n38', 'n39', 'n40', 'n41', 'n42', 'n43', 'n44'],
  light: ['n19']
};

let loader, envTex;

// 헤어라인(브러시드) 알루미늄 결: 세로 줄무늬 거칠기 맵
function brushedTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#7a7a7a';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = 90 + Math.random() * 80 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.08 + Math.random() * 0.18})`;
    g.fillRect(Math.random() * 512, 0, 0.6 + Math.random() * 1.4, 512);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  return t;
}

// 메시마다 주로 향하는 면에 맞춰 평면 UV를 만들어 결 방향을 맞춥니다.
function planarUV(geo) {
  if (geo.attributes.uv) return;
  geo.computeBoundingBox();
  const b = geo.boundingBox, s = new THREE.Vector3();
  b.getSize(s);
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  // 가장 얇은 축을 법선 방향으로 보고 나머지 두 축으로 펼침
  const thin = s.x <= s.y && s.x <= s.z ? 'x' : s.y <= s.z ? 'y' : 'z';
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const [u, v] = thin === 'x' ? [z, y] : thin === 'y' ? [x, z] : [x, y];
    uv[i * 2] = u * 4; uv[i * 2 + 1] = v * 4;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// 대각선 라이트 라인: 시안 → 흰색 → 보라 그라데이션 (x축 기준)
function lightMaterial(minX, maxX) {
  return new THREE.ShaderMaterial({
    uniforms: { uMin: { value: minX }, uMax: { value: maxX }, uTime: { value: 0 } },
    vertexShader: `varying float vX; void main(){ vX = position.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform float uMin, uMax, uTime; varying float vX;
      void main(){
        float t = clamp((vX - uMin) / (uMax - uMin), 0., 1.);
        vec3 cyan = vec3(.23,.84,1.), white = vec3(.95,.97,1.), violet = vec3(.71,.42,1.);
        vec3 c = t > .5 ? mix(white, cyan, (t - .5) * 2.) : mix(violet, white, t * 2.);
        float pulse = .9 + .1 * sin(uTime * 1.6 - t * 5.);
        gl_FragColor = vec4(c * 1.6 * pulse, 1.);
      }`,
    side: THREE.DoubleSide,
    toneMapped: false
  });
}

export function mountViewer(host, url) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  if (!envTex) {
    const pm = new THREE.PMREMGenerator(renderer);
    envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  scene.environment = envTex;
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-1.5, 2.5, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 0.8);
  rim.position.set(2, 1, -2);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(VIEW.FOV, 1, 0.01, 20);
  const pivot = new THREE.Group();
  scene.add(pivot);

  // 바닥 그림자 (부드러운 원형)
  const sc = document.createElement('canvas');
  sc.width = sc.height = 128;
  const sg = sc.getContext('2d');
  const grd = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = grd;
  sg.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  pivot.add(shadow);

  let lightMat = null, ready = false;
  const brushed = brushedTexture();
  const mats = {
    silver: new THREE.MeshPhysicalMaterial({ color: 0xd4d7db, metalness: 1, roughness: 0.34, roughnessMap: brushed, clearcoat: 0.25, clearcoatRoughness: 0.4, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: 0x141518, metalness: 0.2, roughness: 0.6, side: THREE.DoubleSide }),
    print: new THREE.MeshStandardMaterial({ color: 0x55595f, metalness: 0.3, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide })
  };
  const partOf = {};
  for (const k in PARTS) PARTS[k].forEach(n => (partOf[n] = k));

  loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const loading = loader.loadAsync(url).then(gltf => {
    const model = gltf.scene;
    model.traverse(o => {
      if (!o.isMesh) return;
      const part = partOf[o.name] || partOf[o.parent?.name] || 'silver';
      if (part === 'light') {
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        o.material = lightMat = lightMaterial(b.min.x, b.max.x);
      } else {
        if (part === 'silver') planarUV(o.geometry);
        o.material = mats[part];
      }
    });
    // 바닥 중심을 원점에 두고 크기에 맞춰 카메라 거리 계산
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    pivot.add(model);
    shadow.scale.set(size.x * 1.9, size.z * 1.5, 1);
    shadow.position.y = 0.001;
    pivot.userData.h = size.y;
    const radius = size.length() / 2;
    camera.userData.dist = radius / Math.sin(THREE.MathUtils.degToRad(VIEW.FOV / 2)) * VIEW.FILL / 1.0;
    ready = true;
    resize();
    host.classList.add('v3d-ready');
  });

  // 드래그 회전
  let yaw = VIEW.START_YAW, pitch = VIEW.START_PITCH, vel = 0, dragging = false, lastX = 0, lastY = 0, idleAt = performance.now();
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', e => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; vel = 0;
    el.setPointerCapture(e.pointerId);
    host.classList.add('v3d-dragging');
  });
  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    vel = dx * VIEW.DRAG_SPEED;
    yaw += vel;
    pitch = THREE.MathUtils.clamp(pitch + dy * VIEW.DRAG_SPEED, -0.1, VIEW.PITCH_LIMIT);
  });
  const end = () => { dragging = false; idleAt = performance.now(); host.classList.remove('v3d-dragging'); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  function resize() {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    el.style.width = el.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // 화면에 보일 때만 그림
  let visible = true, raf = 0, last = performance.now();
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !raf) loop(); });
  io.observe(host);

  function loop() {
    raf = 0;
    if (!visible) return;
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!dragging) {
      vel *= 0.92;
      yaw += vel;
      if (now - idleAt > VIEW.AUTO_DELAY) yaw += VIEW.AUTO_SPEED * dt;
    }
    if (ready) {
      pivot.rotation.y = yaw;
      const d = camera.userData.dist, h = pivot.userData.h;
      camera.position.set(0, h / 2 + Math.sin(pitch) * d, Math.cos(pitch) * d);
      camera.lookAt(0, h / 2, 0);
      if (lightMat) lightMat.uniforms.uTime.value = now / 1000;
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(loop);
  }
  loop();

  return {
    loading,
    // 각도 고정 (자동 회전 멈춤) — 확인용
    setAngle(y, p = pitch) { yaw = y; pitch = p; vel = 0; idleAt = Infinity; },
    scene,
    destroy() {
      cancelAnimationFrame(raf); raf = 0; visible = false;
      ro.disconnect(); io.disconnect();
      renderer.dispose();
      el.remove();
    }
  };
}
