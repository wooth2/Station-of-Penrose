// main.js
// - mapOnly.glb(삼각형 맵) 위에서만 캐릭터 이동 (Raycast 스냅)
// - s키: 맵 전체 Orthographic(overview) <-> 캐릭터 1인칭 Perspective(character) 토글
// - 캐릭터 pivot을 발바닥(bottom-center)로 맞춰서 "맵 위에 올려진" 상태로 스폰/이동
// - 1인칭 카메라: 캐릭터 머리 위치에서 전방(walkDir)으로 시점
// - Ortho 카메라: 패널(값 표시) + 고정(원하면 Lock Enabled ON)
// - ✅ (추가) overview(orthographic)에서 맵을 클릭하면 그 면 위로 캐릭터 순간이동(발바닥 스냅)

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// ------- 기본 세팅 -------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

document.body.appendChild(renderer.domElement);

// ====== Cameras (2개) ======
const aspect = window.innerWidth / window.innerHeight;

// 1) 캐릭터 시점용 Perspective (1인칭)
const charCamera = new THREE.PerspectiveCamera(60, aspect, 0.05, 2000);
charCamera.position.set(0, 1.2, 0);
charCamera.lookAt(0, 1.2, 1);
scene.add(charCamera);

// 2) 맵 전체 보기용 Orthographic
let orthoSize = 6; // 맵 크기에 따라 조절 (4~12)
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

// active camera (초기: 맵 전체 보기)
let activeCamera = orthoCamera;
let isOverview = true;

// Stats
const stats = new Stats();
document.body.appendChild(stats.dom);

// Controls (overview에서만 사용)
const orbitControls = new OrbitControls(activeCamera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.enabled = true;

// ✅ Ortho 고정 pose(네가 캡처에서 얻은 값)
const ORTHO_FIXED_POSE = {
  cam: new THREE.Vector3(-5.367, 14.489, 7.639),
  target: new THREE.Vector3(-14.909, 5.006, -1.902),
};

// ✅ overview 각도 고정 옵션
const orthoLock = {
  enabled: true,
  lockRotate: true,
  lockPan: true,
  lockZoom: false,
};

// ✅ Ortho 카메라 디버그(패널 표시용, read-only)
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

// ✅ Ortho 고정 적용 함수
function applyFixedOrthoPose() {
  orthoCamera.position.copy(ORTHO_FIXED_POSE.cam);
  orbitControls.target.copy(ORTHO_FIXED_POSE.target);
  orthoCamera.lookAt(orbitControls.target);
  orthoCamera.updateMatrixWorld(true);
  orbitControls.update();

  orbitControls.enableRotate = !orthoLock.lockRotate;
  orbitControls.enablePan = !orthoLock.lockPan;
  orbitControls.enableZoom = !orthoLock.lockZoom;
}

// 리사이즈
window.addEventListener('resize', onResize, false);
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const asp = w / h;

  // Perspective
  charCamera.aspect = asp;
  charCamera.updateProjectionMatrix();

  // Orthographic
  orthoCamera.left = -orthoSize * asp;
  orthoCamera.right = orthoSize * asp;
  orthoCamera.top = orthoSize;
  orthoCamera.bottom = -orthoSize;
  orthoCamera.updateProjectionMatrix();

  renderer.setSize(w, h);

  // 고정이면 고정 pose로 복원
  if (orthoLock.enabled) applyFixedOrthoPose();
  else if (mapRoot) frameOrthoToObject(orthoCamera, mapRoot, 1.25);
}

// ------- 헬퍼 / 바닥 -------
const axesHelper = new THREE.AxesHelper(2);
scene.add(axesHelper);

// 주의: plane은 raycast 대상에서 제외(맵 바닥에만 스냅하기 위해)
const planeGeo = new THREE.PlaneGeometry(20, 20);
const planeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
const plane = new THREE.Mesh(planeGeo, planeMat);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -0.01;
plane.receiveShadow = true;
scene.add(plane);

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
  showAxes: true,
  showPlane: false,
  ambientIntensity: 1.2,
  dirIntensity: 0.8,

  fbxScale: 0.02,
  walking: false,
  walkSpeed: 1.5,

  // 맵 위 이동
  snapToMap: true,
  footOffset: 0.02,
  autoTurnOnEdge: false,

  // 1인칭 카메라 조정
  fpvHeadY: 1.25,
  fpvForward: 0.1,
  fpvSmooth: 0.35,
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

function setupModelCenter(root) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      const mat = child.material;
      if (mat && mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.needsUpdate = true;
      }
      if (mat && mat.isMeshStandardMaterial) {
        if (mat.metalness > 0.8) mat.metalness = 0.3;
        if (mat.roughness < 0.1) mat.roughness = 0.3;
      }
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  return root;
}

// (캐릭터용) pivot을 발바닥(bottom-center)로 맞춤
function setupCharacterPivotToFeet(root) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      const mat = child.material;
      if (mat && mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.needsUpdate = true;
      }
      if (mat && mat.isMeshStandardMaterial) {
        if (mat.metalness > 0.8) mat.metalness = 0.3;
        if (mat.roughness < 0.1) mat.roughness = 0.3;
      }
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const minY = box.min.y;

  // XZ는 중앙, Y는 바닥(minY) 기준으로 pivot을 발바닥으로
  root.position.sub(new THREE.Vector3(center.x, minY, center.z));
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

  // ✅ 고정 모드면 프레이밍 후 pose를 고정값으로 덮어쓰기
  if (orthoLock.enabled) {
    applyFixedOrthoPose();
    return;
  }

  // (기본 동작) center 프레이밍 (고정 끄면 사용됨)
  const center = box.getCenter(new THREE.Vector3());
  orthoCam.position.set(center.x + 8, center.y + 12, center.z + 8);
  orthoCam.lookAt(center);

  orbitControls.target.copy(center);
  orbitControls.update();
}

// =====================
// Raycast로 바닥 높이 얻기 (아래 스냅용)
// =====================
const downRay = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const downDir = new THREE.Vector3(0, -1, 0);

function getMapHitAtXZ(x, z) {
  if (!walkableMeshes.length) return null;
  rayOrigin.set(x, 100, z);
  downRay.set(rayOrigin, downDir);
  const hits = downRay.intersectObjects(walkableMeshes, true);
  return hits.length ? hits[0] : null;
}

// =====================
// 스폰 위치 / 스냅 함수
// =====================
const spawnXZ = new THREE.Vector2(-3, 0);

function snapCharacterToMapAt(x, z) {
  if (!astroFBX || !walkableMeshes.length) return;
  const hit = getMapHitAtXZ(x, z);
  if (!hit) return;
  astroFBX.position.set(x, hit.point.y + renderParams.footOffset, z);
}

// =====================
// 캐릭터 1인칭 카메라 업데이트
// =====================
const tmpTarget = new THREE.Vector3();
const tmpCamPos = new THREE.Vector3();
const tmpForward = new THREE.Vector3();

function updateCharacterCamera() {
  if (!astroFBX) return;

  tmpForward.copy(walkDir).normalize();

  tmpCamPos
    .copy(astroFBX.position)
    .add(new THREE.Vector3(0, renderParams.fpvHeadY, 0))
    .addScaledVector(tmpForward, renderParams.fpvForward);

  tmpTarget.copy(tmpCamPos).addScaledVector(tmpForward, 10.0);

  charCamera.position.lerp(tmpCamPos, renderParams.fpvSmooth);
  charCamera.lookAt(tmpTarget);
}

// =====================
// ✅ (추가) overview에서 클릭한 면으로 캐릭터 순간이동(teleport)
// =====================
const pickRay = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();

function teleportCharacterToHit(hit) {
  if (!astroFBX || !hit) return;

  astroFBX.position.set(
    hit.point.x,
    hit.point.y + renderParams.footOffset,
    hit.point.z
  );
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  // overview(orthographic)에서만 동작
  if (!isOverview) return;
  if (!walkableMeshes.length || !astroFBX) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

  pickRay.setFromCamera(mouseNDC, orthoCamera);

  const hits = pickRay.intersectObjects(walkableMeshes, true);
  if (!hits.length) return;

  teleportCharacterToHit(hits[0]);
});

// ✅ Ortho 카메라 값 패널 업데이트
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
const fbxLoader = new FBXLoader();

// =====================
// mapOnly.glb 로드 (walkable ground)
// =====================
let mapRoot = null;
const walkableMeshes = [];

gltfLoader.load(
  './models/mapOnly.glb',
  (gltf) => {
    mapRoot = setupStaticModelNoCenter(gltf.scene);
    mapRoot.position.set(0, 0, 0);
    mapRoot.rotation.set(0, 0, 0);
    mapRoot.scale.setScalar(1);

    scene.add(mapRoot);

    walkableMeshes.length = 0;
    mapRoot.traverse((o) => {
      if (o.isMesh) walkableMeshes.push(o);
    });

    console.log('mapOnly.glb 로드 완료 / walkableMeshes:', walkableMeshes.length);

    frameOrthoToObject(orthoCamera, mapRoot, 1.25);

    plane.visible = renderParams.showPlane;

    // 맵 로드 후 캐릭터가 이미 있으면 스폰을 맵 위로 올림
    snapCharacterToMapAt(spawnXZ.x, spawnXZ.y);
  },
  undefined,
  (err) => console.error('mapOnly.glb 로드 실패', err)
);

// =====================
// 캐릭터 (FBX)
// =====================
let astroFBX;
let astroMixer;
const astroActions = {};
let currentAction;
let isWalking = false;
let isTurning = false;
const walkDir = new THREE.Vector3();
const turnStartDir = new THREE.Vector3();
const clock = new THREE.Clock();

fbxLoader.load(
  './models/astronaut.fbx',
  (fbx) => {
    astroFBX = setupCharacterPivotToFeet(fbx);
    astroFBX.scale.setScalar(renderParams.fbxScale);

    astroFBX.position.set(spawnXZ.x, 0, spawnXZ.y);
    scene.add(astroFBX);

    console.log('Astronaut 베이스 로드 완료');

    astroFBX.getWorldDirection(walkDir);
    walkDir.normalize();

    astroMixer = new THREE.AnimationMixer(astroFBX);

    // Idle
    new FBXLoader().load('./models/Standing W_Briefcase Idle.fbx', (idleFBX) => {
      const idleClip = idleFBX.animations[0];
      const idleAction = astroMixer.clipAction(idleClip);

      astroActions.idle = idleAction;
      currentAction = idleAction;
      idleAction.play();
      console.log('Idle 애니메이션 로드 성공');
    });

    // Walk
    new FBXLoader().load('./models/Walking.fbx', (walkFBX) => {
      const walkClip = walkFBX.animations[0];
      const walkAction = astroMixer.clipAction(walkClip);

      walkAction.loop = THREE.LoopRepeat;
      walkAction.clampWhenFinished = false;

      astroActions.walk = walkAction;
      console.log('Walk 애니메이션 로드 성공');
    });

    // Turn180 종료 이벤트
    astroMixer.addEventListener('finished', (e) => {
      if (e.action !== astroActions.turn180) return;

      walkDir.copy(turnStartDir).multiplyScalar(-1);
      astroFBX.lookAt(astroFBX.position.clone().add(walkDir));
      isTurning = false;

      let next = null;
      if (isWalking && astroActions.walk) next = astroActions.walk;
      else if (astroActions.idle) next = astroActions.idle;

      if (next) {
        next.reset();
        next.play();
        currentAction = next;
      }
      astroActions.turn180.stop();
    });

    // Turn180
    new FBXLoader().load(
      './models/Turn180.fbx',
      (turnFBX) => {
        const turnClip = turnFBX.animations[0];
        if (!turnClip) {
          console.warn('Turn180.fbx 에 animations[0] 없음');
          return;
        }

        const turnAction = astroMixer.clipAction(turnClip);
        turnAction.loop = THREE.LoopOnce;
        turnAction.clampWhenFinished = true;

        astroActions.turn180 = turnAction;
        console.log('Turn180 애니메이션 로드 성공');
      },
      undefined,
      (err) => console.error('Turn180 애니메이션 로드 실패', err)
    );

    // 캐릭터 로드 후 맵이 이미 있으면 바로 맵 위로 올림
    snapCharacterToMapAt(spawnXZ.x, spawnXZ.y);
  },
  undefined,
  (err) => console.error('Astronaut 베이스 로드 실패', err)
);

// name에 해당하는 애니메이션으로 부드럽게 전환
function fadeToAction(name, duration) {
  if (!astroMixer) return;
  const nextAction = astroActions[name];
  if (!nextAction) return;
  if (currentAction === nextAction) return;

  nextAction.reset().play();
  if (currentAction) currentAction.crossFadeTo(nextAction, duration, false);
  currentAction = nextAction;
}

// Turn 180 버튼 동작
renderParams.turn180 = () => {
  if (isTurning || !astroActions.turn180 || !astroFBX) return;
  turnStartDir.copy(walkDir);
  isTurning = true;
  fadeToAction('turn180', 0.0);
};

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
gui.add(renderParams, 'showAxes').onChange((v) => {
  axesHelper.visible = v;
});
gui.add(renderParams, 'showPlane').onChange((v) => {
  plane.visible = v;
});

gui
  .add(renderParams, 'fbxScale', 0.001, 0.1, 0.001)
  .name('FBX Scale')
  .onChange((v) => {
    if (astroFBX) astroFBX.scale.setScalar(v);
  });

gui
  .add(renderParams, 'walking')
  .name('Walk')
  .onChange((v) => {
    isWalking = v;
    fadeToAction(v ? 'walk' : 'idle', 0.3);
  });

gui.add(renderParams, 'walkSpeed', 0, 5, 0.1).name('Walk Speed');
gui.add(renderParams, 'snapToMap').name('Snap To Map');
gui.add(renderParams, 'footOffset', 0.0, 0.2, 0.005).name('Foot Offset');
gui.add(renderParams, 'autoTurnOnEdge').name('Auto Turn On Edge');
gui.add(renderParams, 'turn180').name('Turn 180');

gui.add(renderParams, 'fpvHeadY', 0.2, 3.0, 0.01).name('FPV Head Y');
gui.add(renderParams, 'fpvForward', 0.0, 0.6, 0.01).name('FPV Forward');
gui.add(renderParams, 'fpvSmooth', 0.01, 1.0, 0.01).name('FPV Smooth');

// ✅ Ortho 고정 토글
const lockFolder = gui.addFolder('Ortho Lock');
lockFolder
  .add(orthoLock, 'enabled')
  .name('Lock Enabled')
  .onChange((v) => {
    if (v) {
      applyFixedOrthoPose();
    } else {
      orbitControls.enableRotate = true;
      orbitControls.enablePan = true;
      orbitControls.enableZoom = true;
    }
  });
lockFolder.add(orthoLock, 'lockRotate').name('Lock Rotate').onChange(() => {
  if (isOverview && orthoLock.enabled) applyFixedOrthoPose();
});
lockFolder.add(orthoLock, 'lockPan').name('Lock Pan').onChange(() => {
  if (isOverview && orthoLock.enabled) applyFixedOrthoPose();
});
lockFolder.add(orthoLock, 'lockZoom').name('Lock Zoom').onChange(() => {
  if (isOverview && orthoLock.enabled) applyFixedOrthoPose();
});
lockFolder.open();

// ✅ Ortho 카메라 값 패널 (read-only)
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
// "맵 위에서만" 이동
// =====================
function moveCharacterOnMap(dist) {
  if (!astroFBX) return;

  const prevPos = astroFBX.position.clone();
  const nextPos = prevPos.clone().addScaledVector(walkDir, dist);

  if (!renderParams.snapToMap) {
    astroFBX.position.copy(nextPos);
    return;
  }

  const hit = getMapHitAtXZ(nextPos.x, nextPos.z);
  if (hit) {
    astroFBX.position.set(nextPos.x, hit.point.y + renderParams.footOffset, nextPos.z);
  } else {
    astroFBX.position.copy(prevPos);
    if (renderParams.autoTurnOnEdge) renderParams.turn180();
  }
}

// =====================
// s키: overview ortho <-> character 1인칭 perspective 토글
// =====================
window.addEventListener('keydown', (e) => {
  if (e.key === 's' || e.key === 'S') {
    isOverview = !isOverview;

    if (isOverview) {
      activeCamera = orthoCamera;
      orbitControls.object = activeCamera;
      orbitControls.enabled = true;

      if (mapRoot) frameOrthoToObject(orthoCamera, mapRoot, 1.25);
      if (orthoLock.enabled) applyFixedOrthoPose();
    } else {
      activeCamera = charCamera;
      orbitControls.enabled = false;
      updateCharacterCamera();
    }
  }
});

// ------- 렌더 루프 -------
function render() {
  const delta = clock.getDelta();

  if (astroMixer) astroMixer.update(delta);

  // 캐릭터를 항상 맵 높이에 붙이기
  if (astroFBX && renderParams.snapToMap && walkableMeshes.length) {
    const hit = getMapHitAtXZ(astroFBX.position.x, astroFBX.position.z);
    if (hit) astroFBX.position.y = hit.point.y + renderParams.footOffset;
  }

  // 걷기
  if (isWalking && !isTurning && astroFBX) {
    const dist = renderParams.walkSpeed * delta;
    moveCharacterOnMap(dist);
  }

  // 1인칭 카메라 업데이트
  if (!isOverview) updateCharacterCamera();

  // overview이면 고정 유지 + 패널 업데이트
  if (isOverview) {
    if (orthoLock.enabled) applyFixedOrthoPose();
    updateOrthoDebug();
  }

  stats.update();
  if (orbitControls.enabled) orbitControls.update();
  renderer.render(scene, activeCamera);

  requestAnimationFrame(render);
}
render();

// 시작하자마자 overview 고정 적용
if (orthoLock.enabled) applyFixedOrthoPose();
