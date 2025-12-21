// main.js
// - triangle_final.glb(삼각형 맵) 렌더링
// - s키: Orthographic(overview) <-> Perspective(전체맵) 토글
// - s를 누를 때마다 Ortho/Persp 둘 다 동일한 FIXED POSE(카메라 위치+타겟)로 고정 적용 (토글 시점에만)
// - (추가) 맵 로드 후: 카메라를 "맵 중심"으로 평행이동(recenter) + 초기 줌아웃(조금 멀리)
// - 캐릭터/이동/스냅/텔레포트 관련 코드 제거
// - Skybox: "배경(cubeTexture)"가 아니라 "큰 큐브(mesh)"로 생성해서 진짜 하늘처럼 보이게
//   - skyMat.toneMapped = false (톤매핑 영향 제거)
//   - depthWrite/depthTest 끄기 (깊이 간섭 방지)
//   - frustumCulled 끄기 (컬링 방지)
//   - 렌더 루프에서 스카이박스를 카메라 위치로 이동 (무한 배경)

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ------- 기본 세팅 -------
const scene = new THREE.Scene();

// Skybox Mesh (크기 조절 가능 + 카메라 따라다님)
const skyTexture = new THREE.TextureLoader().load(
  './models/blackSky.jpg',
  (t) => {
    t.colorSpace = THREE.SRGBColorSpace;

    // (선택) 별이 너무 크/작으면 반복으로 조절 가능
    // t.wrapS = THREE.RepeatWrapping;
    // t.wrapT = THREE.RepeatWrapping;
    // t.repeat.set(4, 4); // 숫자↑ => 패턴 더 촘촘 (별이 작아짐)

    t.needsUpdate = true;
  },
  undefined,
  (err) => console.error('Skybox 이미지 로드 실패', err)
);

const skyMat = new THREE.MeshBasicMaterial({
  map: skyTexture,
  side: THREE.BackSide,
  depthWrite: false, // skybox가 depth를 덮지 않게
  depthTest: false,  // (중요) depth 테스트도 끄면 더 안정적
});
skyMat.toneMapped = false; // 톤매핑 영향 제거

const skyBox = new THREE.Mesh(
  new THREE.BoxGeometry(5000, 5000, 5000), // 여기 크게 키우면 됨
  skyMat
);
skyBox.frustumCulled = false; // 컬링 방지
scene.add(skyBox);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

document.body.appendChild(renderer.domElement);

// ====== Cameras (2개) ======
const aspect = window.innerWidth / window.innerHeight;

// 1) 전체 맵 시점용 Perspective
const mapPerspCamera = new THREE.PerspectiveCamera(60, aspect, 0.05, 2000);
mapPerspCamera.position.set(10, 10, 10);
mapPerspCamera.lookAt(0, 0, 0);
scene.add(mapPerspCamera);

// 2) 맵 전체 보기용 Orthographic
let orthoSize = 13; // 맵 크기에 따라 조절
const orthoCamera = new THREE.OrthographicCamera(
  -orthoSize * aspect,
  orthoSize * aspect,
  orthoSize,
  -orthoSize,
  0.1,
  2000
);
orthoCamera.position.set(8, 12, 8);
orthoCamera.lookAt(0, 0, 0);
scene.add(orthoCamera);

// active camera (초기: ortho)
let activeCamera = orthoCamera;
let isOrthoView = true;

// Stats
const stats = new Stats();
document.body.appendChild(stats.dom);

// Controls (카메라 바뀌면 object만 교체)
const orbitControls = new OrbitControls(activeCamera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.enabled = true;

// FIXED POSE(캡처 값) - Ortho/Persp 공통으로 사용
const ORTHO_FIXED_POSE = {
  cam: new THREE.Vector3(-5.367, 14.489, 7.639),
  target: new THREE.Vector3(-14.909, 5.006, -1.902),
};

// 조작 잠금 옵션
const orthoLock = {
  enabled: true, // 이 값은 controls 제한에만 사용.
  lockRotate: true,
  lockPan: true,
  lockZoom: false,
};

// Ortho 카메라 디버그(패널 표시용, read-only)
const orthoDebug = {
  camX: 0,
  camY: 0,
  camZ: 0,
  tgtX: 0,
  tgtY: 0,
  tgtZ: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
};

// 어떤 카메라든 동일 pose(위치+타겟) 적용
function applyFixedPoseTo(cam) {
  cam.position.copy(ORTHO_FIXED_POSE.cam);
  orbitControls.target.copy(ORTHO_FIXED_POSE.target);

  cam.lookAt(orbitControls.target);
  cam.updateMatrixWorld(true);

  orbitControls.object = cam;
  orbitControls.update();

  // controls 제한
  orbitControls.enableRotate = !orthoLock.lockRotate;
  orbitControls.enablePan = !orthoLock.lockPan;
  orbitControls.enableZoom = !orthoLock.lockZoom;
}

function applyFixedOrthoPose() {
  applyFixedPoseTo(orthoCamera);
}

// (추가) 맵 중심으로 "카메라 포즈(카메라+타겟)"를 평행이동
function recenterFixedPoseToMap(mapObj) {
  if (!mapObj) return;

  const box = new THREE.Box3().setFromObject(mapObj);
  const center = box.getCenter(new THREE.Vector3());

  // 현재 고정 target -> 맵 center 로 평행이동
  const delta = new THREE.Vector3().subVectors(center, ORTHO_FIXED_POSE.target);
  ORTHO_FIXED_POSE.cam.add(delta);
  ORTHO_FIXED_POSE.target.add(delta);
}

// (추가) 고정 포즈를 "줌 아웃"(카메라-타겟 방향으로 뒤로)
function zoomOutFixedPose(factor = 1.6) {
  // factor > 1 : 멀어짐 (1.15~1.4 추천)
  const dir = new THREE.Vector3().subVectors(
    ORTHO_FIXED_POSE.cam,
    ORTHO_FIXED_POSE.target
  );
  dir.multiplyScalar(factor);
  ORTHO_FIXED_POSE.cam.copy(ORTHO_FIXED_POSE.target).add(dir);
}

// 리사이즈
window.addEventListener('resize', onResize, false);
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const asp = w / h;

  // Perspective
  mapPerspCamera.aspect = asp;
  mapPerspCamera.updateProjectionMatrix();

  // Orthographic
  orthoCamera.left = -orthoSize * asp;
  orthoCamera.right = orthoSize * asp;
  orthoCamera.top = orthoSize;
  orthoCamera.bottom = -orthoSize;
  orthoCamera.updateProjectionMatrix();

  renderer.setSize(w, h);

  // 현재 뷰가 Ortho면 프레이밍/고정 처리
  if (isOrthoView) {
    if (mapRoot) frameOrthoToObject(orthoCamera, mapRoot, 1.25);
    if (orthoLock.enabled) applyFixedOrthoPose();
  }
}

// ------- 라이트 -------
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
scene.add(dirLight);

dirLight.target.position.set(0, 0, 0);
scene.add(dirLight.target);

// ------- GUI 파라미터 -------
const gui = new GUI();
const renderParams = {
  exposure: 1.0,
  ambientIntensity: 1.2,
  dirIntensity: 0.8,
};

// ============= 공통 함수: 모델 품질 보정 =============
function setupStaticModelNoCenter(root) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      const mat = child.material;
      if (mat && mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.needsUpdate = true;
      }
    }
  });
  return root;
}

// ============= Orthographic 카메라로 맵 전체 프레이밍 =============
function frameOrthoToObject(orthoCam, object3D, padding = 1.2) {
  if (!orthoCam || !object3D) return;

  const box = new THREE.Box3().setFromObject(object3D);
  const size = box.getSize(new THREE.Vector3());

  // 맵은 x-z 평면으로 넓다고 가정
  const w = size.x * padding;
  const h = size.z * padding;

  const asp = window.innerWidth / window.innerHeight;

  if (w / h > asp) {
    orthoCam.left = -w / 2;
    orthoCam.right = w / 2;
    orthoCam.top = (w / 2) / asp;
    orthoCam.bottom = -(w / 2) / asp;
  } else {
    orthoCam.top = h / 2;
    orthoCam.bottom = -h / 2;
    orthoCam.right = (h / 2) * asp;
    orthoCam.left = -(h / 2) * asp;
  }

  orthoCam.near = 0.1;
  orthoCam.far = 2000;
  orthoCam.updateProjectionMatrix();

  // (기본) center 프레이밍
  const center = box.getCenter(new THREE.Vector3());
  orthoCam.position.set(center.x + 8, center.y + 12, center.z + 8);
  orthoCam.lookAt(center);

  orbitControls.target.copy(center);
  orbitControls.update();
}

// Ortho 카메라 값 패널 업데이트
function updateOrthoDebug() {
  orthoDebug.camX = +orthoCamera.position.x.toFixed(3);
  orthoDebug.camY = +orthoCamera.position.y.toFixed(3);
  orthoDebug.camZ = +orthoCamera.position.z.toFixed(3);

  orthoDebug.tgtX = +orbitControls.target.x.toFixed(3);
  orthoDebug.tgtY = +orbitControls.target.y.toFixed(3);
  orthoDebug.tgtZ = +orbitControls.target.z.toFixed(3);

  orthoDebug.rotX = +orthoCamera.rotation.x.toFixed(3);
  orthoDebug.rotY = +orthoCamera.rotation.y.toFixed(3);
  orthoDebug.rotZ = +orthoCamera.rotation.z.toFixed(3);
}

// ------- 로더 -------
const gltfLoader = new GLTFLoader();

// =====================
// triangle_final.glb 로드
// =====================
let mapRoot = null;

gltfLoader.load(
  './models/triangle_final.glb',
  (gltf) => {
    mapRoot = setupStaticModelNoCenter(gltf.scene);
    mapRoot.position.set(0, 0, 0);
    mapRoot.rotation.set(0, 0, 0);
    mapRoot.scale.setScalar(1);

    scene.add(mapRoot);

    console.log('triangle_final.glb 로드 완료');

    // (1) 카메라를 맵 중심으로 평행이동 (고정 포즈 자체를 이동)
    recenterFixedPoseToMap(mapRoot);

    // (2) 초기 줌아웃 (조금 멀리)
    zoomOutFixedPose(1.25);

    // (3) 현재 뷰(초기: Ortho)에 고정 포즈 적용
    applyFixedPoseTo(activeCamera);
  },
  undefined,
  (err) => console.error('triangle_final.glb 로드 실패', err)
);

// ------- GUI -------
gui.add(renderParams, 'exposure', 0.1, 2.5).onChange((v) => {
  renderer.toneMappingExposure = v;
});
gui.add(renderParams, 'ambientIntensity', 0, 3).onChange((v) => {
  ambientLight.intensity = v;
});
gui.add(renderParams, 'dirIntensity', 0, 3).onChange((v) => {
  dirLight.intensity = v;
});

// Ortho Lock 폴더 (controls 제한용)
const lockFolder = gui.addFolder('Ortho Lock');
lockFolder
  .add(orthoLock, 'enabled')
  .name('Lock Enabled')
  .onChange((v) => {
    if (v) {
      orbitControls.enableRotate = !orthoLock.lockRotate;
      orbitControls.enablePan = !orthoLock.lockPan;
      orbitControls.enableZoom = !orthoLock.lockZoom;
      orbitControls.update();
    } else {
      orbitControls.enableRotate = true;
      orbitControls.enablePan = true;
      orbitControls.enableZoom = true;
    }
  });

lockFolder.add(orthoLock, 'lockRotate').name('Lock Rotate').onChange(() => {
  orbitControls.enableRotate = !orthoLock.lockRotate;
});
lockFolder.add(orthoLock, 'lockPan').name('Lock Pan').onChange(() => {
  orbitControls.enablePan = !orthoLock.lockPan;
});
lockFolder.add(orthoLock, 'lockZoom').name('Lock Zoom').onChange(() => {
  orbitControls.enableZoom = !orthoLock.lockZoom;
});
lockFolder.open();

// Ortho 카메라 값 패널 (read-only)
const camFolder = gui.addFolder('Ortho Camera (Read-only)');
camFolder.add(orthoDebug, 'camX').listen();
camFolder.add(orthoDebug, 'camY').listen();
camFolder.add(orthoDebug, 'camZ').listen();
camFolder.add(orthoDebug, 'tgtX').listen();
camFolder.add(orthoDebug, 'tgtY').listen();
camFolder.add(orthoDebug, 'tgtZ').listen();
camFolder.add(orthoDebug, 'rotX').listen();
camFolder.add(orthoDebug, 'rotY').listen();
camFolder.add(orthoDebug, 'rotZ').listen();
camFolder.open();

// =====================
// s키: Ortho(overview) <-> Perspective(전체맵) 토글
// 토글할 때마다 둘 다 FIXED POSE 적용(토글 시점에만)
// =====================
window.addEventListener('keydown', (e) => {
  if (e.key === 's' || e.key === 'S') {
    isOrthoView = !isOrthoView;

    activeCamera = isOrthoView ? orthoCamera : mapPerspCamera;
    orbitControls.object = activeCamera;
    orbitControls.enabled = true;

    // 토글 시점에만: Ortho/Persp 모두 동일한 고정 pose 적용
    applyFixedPoseTo(activeCamera);
  }
});

// ------- 렌더 루프 -------
function render() {
  // 스카이박스를 항상 카메라 위치로 이동 (무한 배경처럼)
  skyBox.position.copy(activeCamera.position);

  // Ortho이면 패널 업데이트
  if (isOrthoView) updateOrthoDebug();

  stats.update();
  if (orbitControls.enabled) orbitControls.update();
  renderer.render(scene, activeCamera);

  requestAnimationFrame(render);
}
render();

// 초기 1회: 고정 pose 적용 (맵 로드 전이므로, 맵 로드 후 recenter/zoomout이 다시 적용됨)
applyFixedPoseTo(orthoCamera);
