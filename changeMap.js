// changeMap.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------- Scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

// ---------- Camera (기본: Perspective) ----------
const aspect = window.innerWidth / window.innerHeight;

const perspectiveCamera = new THREE.PerspectiveCamera(
  45,
  aspect,
  0.1,
  1000
);
perspectiveCamera.position.set(0, 1.5, 4);

// Orthographic 설정값
const orthoSize = 2.2;
const orthographicCamera = new THREE.OrthographicCamera(
  -orthoSize * aspect,
  orthoSize * aspect,
  orthoSize,
  -orthoSize,
  0.1,
  1000
);
orthographicCamera.position.set(0, 1.5, 4);

let activeCamera = perspectiveCamera;

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ---------- Controls ----------
const controls = new OrbitControls(activeCamera, renderer.domElement);
controls.enableDamping = true;

// ---------- Lights ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 1);
dir.position.set(5, 10, 7);
dir.castShadow = true;
scene.add(dir);

// ---------- Models ----------
const loader = new GLTFLoader();

let model1 = null;
let model2 = null;
let isShowingModel1 = true;

const MODEL_POSITION = new THREE.Vector3(0, 0, 0);
const MODEL_SCALE = 1;

// Load model 1
loader.load('./models/orthogonal_geometry.glb', (gltf) => {
  model1 = gltf.scene;
  model1.position.copy(MODEL_POSITION);
  model1.scale.setScalar(MODEL_SCALE);
  model1.visible = true;
  scene.add(model1);
});

// Load model 2
loader.load('./models/perspective_geometry.glb', (gltf) => {
  model2 = gltf.scene;
  model2.position.copy(MODEL_POSITION);
  model2.scale.setScalar(MODEL_SCALE);
  model2.visible = false;
  scene.add(model2);
});

// ---------- 키 입력 ----------
window.addEventListener('keydown', (e) => {
  if (e.key === 'a' || e.key === 'A') {
    if (!model1 || !model2) return;
    isShowingModel1 = !isShowingModel1;

    model1.visible = isShowingModel1;
    model2.visible = !isShowingModel1;
  }

  if (e.key === 's' || e.key === 'S') {
    // 카메라 전환
    const prevPos = activeCamera.position.clone();
    const prevQuat = activeCamera.quaternion.clone();

    // Perspective ↔ Orthographic 스위칭
    if (activeCamera === perspectiveCamera) {
      activeCamera = orthographicCamera;
    } else {
      activeCamera = perspectiveCamera;
    }

    // 카메라 위치·시점 유지
    activeCamera.position.copy(prevPos);
    activeCamera.quaternion.copy(prevQuat);

    // OrbitControls 다시 연결
    controls.object = activeCamera;
    controls.update();
  }
});

// ---------- Resize ----------
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;

  perspectiveCamera.aspect = w / h;
  perspectiveCamera.updateProjectionMatrix();

  orthographicCamera.left = -orthoSize * (w / h);
  orthographicCamera.right = orthoSize * (w / h);
  orthographicCamera.top = orthoSize;
  orthographicCamera.bottom = -orthoSize;
  orthographicCamera.updateProjectionMatrix();

  renderer.setSize(w, h);
});

// ---------- Animation Loop ----------
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, activeCamera);
}
animate();
