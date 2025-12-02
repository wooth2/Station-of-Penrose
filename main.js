// main.js
// - Blender glb 로드
// - Light / Renderer 세팅 보정
// - Astronaut + Beige Block 두 모델 로드
// 우주인: y=0에 그대로
// 블록: 바운딩 박스 높이 기반으로 바닥 위에 올림

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

// 카메라
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(3, 2, 6);
camera.lookAt(0, 1, 0);
scene.add(camera);

const stats = new Stats();
document.body.appendChild(stats.dom);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;

// 리사이즈
window.addEventListener('resize', onResize, false);
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ------- 헬퍼 / 바닥 -------
const axesHelper = new THREE.AxesHelper(2);
scene.add(axesHelper);

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

// ============= 공통 함수: 모델 품질/중심 보정 =============
function setupModel(root) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      const mat = child.material;
      if (mat && mat.map) {
        // colorSpace 사용
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.needsUpdate = true;
      }
      if (mat && mat.isMeshStandardMaterial) {
        if (mat.metalness > 0.8) mat.metalness = 0.3;
        if (mat.roughness < 0.1) mat.roughness = 0.3;
      }
    }
  });

  // 중심을 원점 근처로
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  return root;
}

// ------- GLB 로더 -------
const loader = new GLTFLoader();

// 1) 우주인 모델 (y=0 고정)
loader.load('./models/astronaut(free).glb', (gltf) => {
  const astro = setupModel(gltf.scene);

  // 우주인 기본 위치대로 y=0
  astro.position.set(0, 0, 0);
  scene.add(astro);

  // 카메라 세팅 astro 크기 기준으로
  const astroBox = new THREE.Box3().setFromObject(astro);
  const astroSize = astroBox.getSize(new THREE.Vector3());
  const sizeLen = astroSize.length();

  camera.near = sizeLen / 100;
  camera.far = sizeLen * 100;
  camera.updateProjectionMatrix();

  const camPos = new THREE.Vector3(
    sizeLen,
    sizeLen * 0.6,
    sizeLen
  );
  camera.position.copy(camPos);
  orbitControls.target.set(0, astroSize.y / 2, 0);
  orbitControls.update();

  console.log('Astronaut 모델 로드 완료');
});

// 1) 우주인 모델 by 조원희
let astroFBX;
let astroMixer;
const astroActions = {};
let currentAction;

const clock = new THREE.Clock();
const fbxLoader = new FBXLoader();

// 리깅된 T자 포즈 astronaut.fbx 로드 (With Skin)
fbxLoader.load(
  console.log('Test 1848');
  './models/astronaut.fbx',
  (fbx) => {
    astroFBX = setupModel(fbx);  // 메시+본 모두 포함

    astroFBX.scale.setScalar(0.02);
    astroFBX.position.set(-3, -0.01, 0);

    scene.add(astroFBX);

    astroMixer = new THREE.AnimationMixer(astroFBX);

    console.log('Astronaut 베이스 로드 완료, idle 애니메이션 로드 시도');

    // --- Idle 애니메이션 (Without Skin)에서 클립만 빼오기 ---
    const idleLoader = new FBXLoader();
    idleLoader.load(
      './models/Standing W_Briefcase Idle.fbx',   // 스킨 없는 Idle 파일
      (idleFBX) => {
        console.log('Idle 애니메이션 로드 성공', idleFBX);

        const clip = idleFBX.animations[0];
        if (!clip) {
          console.warn('Idle FBX에 animations[0] 없음');
          return;
        }

        const idleAction = astroMixer.clipAction(clip);
        astroActions.idle = idleAction;
        currentAction = idleAction;

        idleAction.play();
        console.log('Idle 애니메이션 재생 시작');
      },
      undefined,
      (error) => {
        console.error('Idle 애니메이션 로드 실패', error);
      }
    );
  },
  undefined,
  (error) => {
    console.error('Astronaut 베이스 로드 실패', error);
  }
);

// 2) 베이지 블록 모델만 바운딩 박스 기반 y 보정
loader.load('./models/beige_block.glb', (gltf) => {
  const block = setupModel(gltf.scene);

  // 블록 높이 계산
  const blockBox = new THREE.Box3().setFromObject(block);
  const blockSize = blockBox.getSize(new THREE.Vector3());

  // x=2로 옆으로, y=blockSize.y/2 만큼 올려 바닥 위에 붙임
  block.position.set(2, blockSize.y / 2, 0);

  scene.add(block);
  console.log('Beige Block 모델 로드 완료');
});

// ------- GUI -------
const gui = new GUI();
const renderParams = {
  exposure: 1.0,
  showAxes: true,
  showPlane: true,
  ambientIntensity: 1.2,
  dirIntensity: 0.8,
  fbxScale: 0.02,
};

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
gui.add(renderParams, 'fbxScale', 0.001, 0.1, 0.001)
  .name('FBX Scale')
  .onChange(v => {
    if (astroFBX) astroFBX.scale.setScalar(v);
  });

// ------- 렌더 루프 -------
function render() {
  const delta = clock.getDelta();
  if (astroMixer) {
    astroMixer.update(delta);
  }
  stats.update();
  orbitControls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
