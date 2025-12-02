// blender_model.js
// - Blender glb 로드
// - 원인 2: 라이트/렌더러 세팅 보정

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ------- 기본 세팅 -------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

// 렌더러
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// 컬러 스페이스 + 톤매핑 설정 (중요)
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

// FPS 표시
const stats = new Stats();
document.body.appendChild(stats.dom);

// OrbitControls
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

// ------- 라이트 (밝게 + 부드럽게 조정) -------

// 전체를 밝혀주는 Ambient Light
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

// 방향성 라이트 (이전보다 약하게)
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
scene.add(dirLight);

// 그림자 떨어질 위치 기준
dirLight.target.position.set(0, 0, 0);
scene.add(dirLight.target);

// ------- GLB 모델 로드 -------
const loader = new GLTFLoader();

loader.load(
  './models/astronaut(free).glb',
  (gltf) => {
    const root = gltf.scene;

    // 텍스처 sRGB 보정 + 그림자 설정
    root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        const mat = child.material;
        if (mat && mat.map) {
          mat.map.encoding = THREE.sRGBEncoding;
          mat.needsUpdate = true;
        }
        // 필요하면 roughness/metalness 살짝 줄여보기
        if (mat && mat.isMeshStandardMaterial) {
          if (mat.metalness > 0.8) mat.metalness = 0.3;
          if (mat.roughness < 0.1) mat.roughness = 0.3;
        }
      }
    });

    // 모델 중심/크기 계산해서 정렬
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());

    // 중심을 원점 근처로 이동
    root.position.x += (0 - center.x);
    root.position.y += (0 - center.y);
    root.position.z += (0 - center.z);

    scene.add(root);

    // 카메라/컨트롤 타겟 세팅
    camera.near = size / 100;
    camera.far = size * 100;
    camera.updateProjectionMatrix();

    const camPos = center.clone().add(new THREE.Vector3(size, size * 0.6, size));
    camera.position.copy(camPos);
    orbitControls.target.copy(new THREE.Vector3(0, center.y, 0));
    orbitControls.update();

    console.log('GLB 모델 로드 완료');
  },
  (xhr) => {
    if (xhr.total) {
      console.log(`로딩: ${(xhr.loaded / xhr.total * 100).toFixed(1)}%`);
    } else {
      console.log(`로딩 중... ${xhr.loaded} bytes`);
    }
  },
  (error) => {
    console.error('GLB 로드 에러:', error);
  }
);

// ------- GUI -------
const gui = new GUI();
const renderParams = {
  exposure: 1.0,
  showAxes: true,
  showPlane: true,
  ambientIntensity: 1.2,
  dirIntensity: 0.8,
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

// ------- 렌더 루프 -------
function render() {
  stats.update();
  orbitControls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

render();
