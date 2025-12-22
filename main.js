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
// - (추가) 우주선 3개 (ufo.glb, low_poly_space_ship.glb, toy_rocket.glb) 배경에 떠있게 추가

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// =====================
// 시나리오 관리 시스템
// =====================
class ScenarioManager {
  constructor() {
    this.currentStep = 0;
    this.freeWalkTimer = null;
    this.waitingForCKey = false;
  }

  async start() {
    this.currentStep = 1;

    // 시작 화면 종료 (캐릭터 클로즈업 렌더링 중지)
    try {
      if (typeof isStartScreenActive !== 'undefined') isStartScreenActive = false;
      if (typeof startScreenRenderer !== 'undefined' && startScreenRenderer?.domElement?.parentElement) {
        startScreenRenderer.domElement.parentElement.removeChild(startScreenRenderer.domElement);
      }
      if (typeof startScreenRenderer !== 'undefined') startScreenRenderer.dispose?.();
    } catch (e) {
      console.warn('[Scenario] start screen cleanup failed:', e);
    }
    
    // GUI와 Stats 숨기기
    const guiElements = document.querySelectorAll('.lil-gui');
    guiElements.forEach(el => el.style.display = 'none');
    
    await this.step2_welcome();
  }

  // 2. "펜로즈의 정거장에 오신 것을 환영합니다!" -> 클릭
  async step2_welcome() {
    await window.showSubtitle('펜로즈의 정거장에 오신 것을 환영합니다!<br>(클릭 시 다음으로 넘어갑니다)', 999999, null, true);
    await this.step3_gravity();
  }

  // 3. "이곳에서는 중력이 항상 발 아래를 향합니다." -> 클릭
  async step3_gravity() {
    await window.showSubtitle('이곳에서는 중력이 항상 발 아래를 향합니다.', 999999, null, true);
    await this.step4_tutorial();
  }

  // 4. "이동 방법을 알려드릴게요." -> 클릭
  async step4_tutorial() {
    await window.showSubtitle('이동 방법을 알려드릴게요.', 999999, null, true);
    await this.step5_controls();
  }

  // 5. "W key : 걷기 / T : 180도 회전하기 / 마우스휠 : 확대/축소 / 드래그 : 화면 이동" -> 클릭
  async step5_controls() {
    await window.showSubtitle(
      'W : 걷기 / T : 180도 회전하기<br>마우스휠 : 확대·축소 / 드래그 : 화면 이동',
      999999,
      null,
      true
    );
  
    // ✅ 자막 끝난 뒤, 좌측 상단 키 가이드 표시
    if (typeof window.showKeyGuide === 'function') {
      window.showKeyGuide(true);
    }
  
    await this.step6_freeWalk();
  }

  // 6. "정거장을 자유롭게 걸어보세요." -> 클릭
  async step6_freeWalk() {
    await window.showSubtitle('정거장을 자유롭게 걸어보세요.', 999999, null, true);
    this.currentStep = 6;
    
    // 30초 후 자동으로 다음 단계
    this.freeWalkTimer = setTimeout(() => {
      this.step7_wait();
    }, 30000);
  }

  // 7. "…잠깐." -> 2초 뒤 자동 -> "뭔가 이상하지 않나요?"
  async step7_wait() {
    if (this.freeWalkTimer) clearTimeout(this.freeWalkTimer);
    
    await window.showSubtitle('…잠깐.', 2000, null, false);
    await this.step8_strange();
  }

  // "뭔가 이상하지 않나요?" -> 2초 뒤 네/아니요 버튼
  async step8_strange() {
    this.currentStep = 8;
    window.showSubtitle('뭔가 이상하지 않나요?', 999999, null, false);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    window.showChoiceButtons([
      {
        text: '네',
        callback: () => this.step9_ckey()
      },
      {
        text: '아니요',
        callback: async () => {
          await window.showSubtitle('조금만 더 걸어보세요.', 2000, null, false);
          setTimeout(() => {
            this.step8_2_nowFound();
          }, 30000);
        }
      }
    ]);
  }

  // "이젠 아시겠나요?" -> 2초 뒤 네/아니요 버튼
  async step8_2_nowFound() {
    window.showSubtitle('이젠 아시겠나요?', 999999, null, false);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    window.showChoiceButtons([
      {
        text: '네',
        callback: () => this.step9_ckey()
      },
      {
        text: '아니요',
        callback: async () => {
          await window.showSubtitle('조금만 더 걸어보세요.', 2000, null, false);
          setTimeout(() => {
            this.step8_2_nowFound();
          }, 30000);
        }
      }
    ]);
  }

  // 8. "C key를 누르면 시점이 전환됩니다." -> 클릭
  async step9_ckey() {
    this.currentStep = 9;
  
    // ✅ 자막 기다리지 말고, 자막 뜨는 순간 HUD에 C 추가
    if (typeof window.addCKeyGuide === 'function') {
      window.addCKeyGuide();
    }
    if (typeof window.showKeyGuide === 'function') {
      window.showKeyGuide(true); // 혹시 숨겨져있을까봐
    }
  
    // 자막은 그대로 표시 (클릭해서 넘기기)
    window.showSubtitle('C 키를 누르면 시점이 전환됩니다.', 999999, null, true);
  
    this.waitingForCKey = true;
  }

  // C키가 눌렸을 때 호출
  onCKeyPressed() {
    if (!this.waitingForCKey) return;
    this.waitingForCKey = false;

    // 토글은 이미 외부에서 실행되었을 가능성이 높다.
    // (혹시 외부에서 토글을 못 했다면 여기서 한 번 더 안전장치로 토글)
    try {
      const cp = (typeof window !== 'undefined' && window.cameraParams) ? window.cameraParams : (typeof cameraParams !== 'undefined' ? cameraParams : null);
      if (cp && typeof cp.toggleView === 'function') {
        // 외부에서 이미 토글했어도, toggleView()는 토글 1회라서
        // "중복 토글"이 되면 다시 원상복귀될 수 있음.
        // 따라서 여기서는 절대 토글을 강제하지 않고,
        // 외부에서 토글이 되도록 만들고 싶으면 아래 줄을 주석 해제하지 말 것.
        // cp.toggleView();
      }
    } catch (_) {}

    setTimeout(() => {
      this.step10_seeNow();
    }, 1500);
  }

    // 9. “이제 보이시나요?”
    async step10_seeNow() {
      // 1.5초 뒤에 호출되는 단계라, 여기선 바로 띄우고 자동으로 10번으로 진행
      await window.showSubtitle('이제 보이시나요?', 1200, null, false);
      await this.step11_illusion();
    }
  
    // 10. 착시 설명 -> 5초 뒤 ‘다음’ 버튼 생김 -> 다음 클릭 시 진행
    // 10. 착시 설명 -> (버튼 없이) 자막 클릭하면 다음으로 진행
    async step11_illusion() {
      await window.showSubtitle(
        '이 우주 정거장은 착시를 기반으로 만들어졌습니다.<br>한 방향으로만 걷고 있다고 믿었지만,<br>공간은 이미 모순을 포함하고 있었죠.',
        999999,  // 길게 두고, 클릭으로 넘기기
        null,
        true     // ✅ 클릭해서 넘기기 ON
      );

      // ✅ 자막이 클릭되어 종료되면 다음 단계
      await this.step12_revelation();
    }
  
    // 11. “보이지 않을 때는...” (3초 뒤) “보는 순간...”
    async step12_revelation() {
      // 자동 진행: 클릭 없이
      await window.showSubtitle('보이지 않을 때는, 끝없이 이어져 보였습니다.', 3000, null, false);
      await window.showSubtitle('보는 순간, 모든 것이 달라졌죠.', 1800, null, false);
  
      await this.step13_ending();
    }
  
    // 12. “펜로즈의 정거장” - fade out
    async step13_ending() {
    
      window.fadeOut(() => {
        console.log('시나리오 종료');
      });
    }
}

const scenarioManager = new ScenarioManager();
window.scenarioManager = scenarioManager;



// ------- 기본 세팅 -------
const scene = new THREE.Scene();

// =====================
// World group (Ortho drag pan용)
// - Ortho에서 마우스 드래그로 "화면이 움직이는 것처럼" 보이게 만들기 위해
//   카메라를 움직이지 않고(map/character만) worldGroup을 평행이동한다.
// - 배경(orthoBgScene)은 별도 씬에서 렌더링되므로 worldGroup 이동의 영향을 받지 않는다.
// =====================
const worldGroup = new THREE.Group();
scene.add(worldGroup);

// Perspective orbit target (map 중심)
const mapFocusTarget = new THREE.Vector3(0, 0, 0);

// =====================
// Background (CubeTexture) - 17-env-map-static 방식
// - scene.background 에 CubeTexture 를 설정
// - blackSky.jpg 는 1024x2048(세로로 김)이라 cubemap face(정사각형) 조건을 만족시키기 위해
//   런타임에서 가운데를 정사각형으로 크롭해서 6면에 동일하게 복제해서 사용
// - 일부 환경/버전에서 Orthographic + scene.background(CubeTexture)가 하얗게 보이는 경우가 있어,
//   Ortho 전용으로 skybox mesh(카메라를 따라다니는 큰 박스)도 함께 준비해 fallback으로 사용
// =====================

const SKY_IMAGE_PATH = './models/blackSky.jpg';
const SKY_URLS = [SKY_IMAGE_PATH, SKY_IMAGE_PATH, SKY_IMAGE_PATH, SKY_IMAGE_PATH, SKY_IMAGE_PATH, SKY_IMAGE_PATH];

let skyCubeTexture = null;   // Perspective에서 사용할 scene.background(CubeTexture)

// Ortho 전용: 무한 타일 배경(화면 고정 쿼드 + texture.repeat)
// - scene.background 는 Ortho에서 끔
// - 카메라 zoom/이동에 따라 repeat/offset 을 갱신해서 "무한히 이어지는" 느낌
// - "3배 더 크게": 초기 Ortho 뷰에서 타일 1장의 세로 길이가 화면 세로 길이와 같도록(기존 3x3 대비 3배)
const SKY_IMAGE_ASPECT = 1024 / 2048; // blackSky.jpg 원본 비율 (w/h = 0.5)

let orthoBgScene = null;
let orthoBgCam = null;
let orthoBgMesh = null;
let orthoBgTex = null;
let orthoBgBaseTileH = null; // world units
let orthoBgBaseTileW = null; // world units

function cropCenterSquareToCanvas(img) {
  const size = Math.min(img.width, img.height);
  const sx = Math.floor((img.width - size) / 2);
  const sy = Math.floor((img.height - size) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
  return canvas;
}


function ensureOrthoBackgroundPlane() {
  if (orthoBgScene) return;

  // 1) 화면 고정 배경용 씬 + 카메라(NDC)
  orthoBgScene = new THREE.Scene();
  orthoBgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  orthoBgScene.add(orthoBgCam);

  // 2) fullscreen quad (NDC)
  const quadGeo = new THREE.PlaneGeometry(2, 2);

  const texLoader = new THREE.TextureLoader();
  texLoader.load(
    SKY_IMAGE_PATH,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 1);
      tex.offset.set(0, 0);
      tex.needsUpdate = true;
      orthoBgTex = tex;

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        depthTest: false,
        depthWrite: false,
      });
      orthoBgMesh = new THREE.Mesh(quadGeo, mat);
      orthoBgMesh.frustumCulled = false;
      orthoBgMesh.renderOrder = -10000;
      orthoBgScene.add(orthoBgMesh);

      // "3배 더 크게": 초기 Ortho 뷰에서 타일 1장의 세로 길이 == 화면 세로 길이
      // (기존 3x3 타일 대비 3배 크기)
      // IMPORTANT:
      // Ortho에서 zoom in/out 해도 배경은 "그대로"(화면에 고정된 크기) 보여야 한다.
      // 그래서 타일 기준 크기는 orthoCamera.zoom 영향을 받지 않게 잡는다.
      const baseW = Math.abs(orthoCamera.right - orthoCamera.left);
      const baseH = Math.abs(orthoCamera.top - orthoCamera.bottom);
      const viewH = baseH; // zoom 무시
      orthoBgBaseTileH = viewH;
      orthoBgBaseTileW = orthoBgBaseTileH * SKY_IMAGE_ASPECT;

      updateOrthoBackgroundTiling();
    },
    undefined,
    (err) => console.error('Ortho 배경 이미지 로드 실패', err)
  );
}

function updateOrthoBackgroundTiling() {
  if (!orthoBgTex || !orthoBgBaseTileH || !orthoBgBaseTileW) return;

  // IMPORTANT:
  // zoom은 배경에 영향을 주면 안 된다. (zoom해도 배경이 확대/축소되 ...)
  // 따라서 viewW/viewH 계산에서 orthoCamera.zoom을 쓰지 않는다.
  const baseW = Math.abs(orthoCamera.right - orthoCamera.left);
  const baseH = Math.abs(orthoCamera.top - orthoCamera.bottom);
  const viewW = baseW;
  const viewH = baseH;

  // 화면에 보이는 월드 크기 / 타일 월드 크기 = 반복 횟수
  const repX = Math.max(viewW / orthoBgBaseTileW, 1e-6);
  const repY = Math.max(viewH / orthoBgBaseTileH, 1e-6);
  orthoBgTex.repeat.set(repX, repY);

  // 카메라 이동에 따라 패턴이 "월드에 붙어있는 것처럼" 흐르게
  const offX = -orthoCamera.position.x / orthoBgBaseTileW;
  const offY = -orthoCamera.position.y / orthoBgBaseTileH;
  // RepeatWrapping에서 offset은 0~1 범위로 맞춰주는 게 안정적
  orthoBgTex.offset.set(((offX % 1) + 1) % 1, ((offY % 1) + 1) % 1);
  orthoBgTex.needsUpdate = true;
}


function loadSkyBackground() {
  const imgLoader = new THREE.ImageLoader();
  imgLoader.load(
    SKY_IMAGE_PATH,
    (img) => {
      if (!img || !img.width || !img.height) {
        console.error('Sky 이미지 로드 실패(이미지 데이터 없음)');
        return;
      }

      const canvasSquare = cropCenterSquareToCanvas(img);

      // scene.background (CubeTexture)
      const canvases = new Array(6).fill(0).map(() => canvasSquare);
      skyCubeTexture = new THREE.CubeTexture(canvases);
      skyCubeTexture.colorSpace = THREE.SRGBColorSpace;
      skyCubeTexture.needsUpdate = true;
    },
    undefined,
    (err) => console.error('Sky 이미지 로드 실패', err)
  );
}
loadSkyBackground();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

document.body.appendChild(renderer.domElement);

// =====================
// 시작 화면용 클로즈업 렌더러 (main.js 기능 이식)
// - #start-screen 요소가 있으면 그 안에 투명 캔버스를 삽입
// - '시작하기' 버튼으로 씬 전환 전까지 캐릭터를 화면에 렌더링
// =====================
const startScreenRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
startScreenRenderer.setSize(window.innerWidth, window.innerHeight);
startScreenRenderer.outputColorSpace = THREE.SRGBColorSpace;
startScreenRenderer.toneMapping = THREE.ACESFilmicToneMapping;
startScreenRenderer.toneMappingExposure = 1.0;

// 시작 화면에 추가 (있으면)
const startScreenEl = document.getElementById('start-screen');
if (startScreenEl) {
  startScreenEl.insertBefore(startScreenRenderer.domElement, startScreenEl.firstChild);
}

let isStartScreenActive = true;

// 클로즈업 카메라 (캐릭터 얼굴 클로즈업)
const closeupCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100);
closeupCamera.position.set(0, 1.7, 0.5);
closeupCamera.lookAt(0, 1.6, 0);


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

// 초기 Ortho에서는 CubeTexture background를 사용하지 않고 Plane 배경 사용
scene.background = null;
ensureOrthoBackgroundPlane();

// Controls (카메라 바뀌면 object만 교체)
const orbitControls = new OrbitControls(activeCamera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.enabled = true;
applyControlsForView();

// =====================
// Ortho: 마우스 드래그로 화면 이동(배경 고정, 맵/캐릭터만 이동)
// - 카메라는 고정한 채 worldGroup만 카메라 평면 방향으로 이동
// - zoom 값은 "드래그 감도"(화면에 보이는 월드 크기)에만 반영
// - lil-gui 위에서 드래그할 땐 무시
// =====================
const orthoDrag = {
  active: false,
  startX: 0,
  startY: 0,
  startPos: new THREE.Vector3(),
};

function isEventOnGUI(ev) {
  const t = ev?.target;
  if (!t || typeof t.closest !== 'function') return false;
  return !!t.closest('.lil-gui');
}

function getOrthoUnitsPerPixel() {
  // Ortho에서 화면에 보이는 월드 크기 (zoom 포함)
  const viewW = Math.abs(orthoCamera.right - orthoCamera.left) / Math.max(orthoCamera.zoom, 1e-6);
  const viewH = Math.abs(orthoCamera.top - orthoCamera.bottom) / Math.max(orthoCamera.zoom, 1e-6);
  const w = Math.max(renderer.domElement.clientWidth, 1);
  const h = Math.max(renderer.domElement.clientHeight, 1);
  return {
    x: viewW / w,
    y: viewH / h,
  };
}

function getOrthoCameraRightUp() {
  // 카메라 화면 기준 right/up (월드 좌표)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(orthoCamera.quaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(orthoCamera.quaternion).normalize();
  return { right, up };
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!isOrthoView) return;
  if (e.button !== 0) return; // left only
  if (isEventOnGUI(e)) return;

  orthoDrag.active = true;
  orthoDrag.startX = e.clientX;
  orthoDrag.startY = e.clientY;
  orthoDrag.startPos.copy(worldGroup.position);

  try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (!isOrthoView) return;
  if (!orthoDrag.active) return;
  if (isEventOnGUI(e)) return;

  const dx = e.clientX - orthoDrag.startX;
  const dy = e.clientY - orthoDrag.startY;

  const u = getOrthoUnitsPerPixel();
  const { right, up } = getOrthoCameraRightUp();

  // 커서 이동 방향으로 콘텐츠가 따라오게(worldGroup 이동)
  worldGroup.position.copy(orthoDrag.startPos)
    .addScaledVector(right, dx * u.x)
    .addScaledVector(up, -dy * u.y);

  e.preventDefault();
});

function endOrthoDrag(e) {
  if (!orthoDrag.active) return;
  orthoDrag.active = false;
  try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
}

renderer.domElement.addEventListener('pointerup', endOrthoDrag);
renderer.domElement.addEventListener('pointercancel', endOrthoDrag);

// FIXED POSE(캡처 값) - Ortho/Persp 공통으로 사용
const ORTHO_FIXED_POSE = {
  cam: new THREE.Vector3(9.542, 12.483, 9.541),
  target: new THREE.Vector3(0, 2.95, 0),
};

// Perspective view should be closer to the map center so that the map size feels similar to Ortho
const PERS_CLOSE_FACTOR = 0.125; // bring camera to 1/4 of (camera->mapFocusTarget) distance

// Perspective orbit target (map 중심)
mapFocusTarget.copy(ORTHO_FIXED_POSE.target);

// Camera UI
const cameraParams = {
  mode: 'Orthographic',
  camX: ORTHO_FIXED_POSE.cam.x,
  camY: ORTHO_FIXED_POSE.cam.y,
  camZ: ORTHO_FIXED_POSE.cam.z,
  tgtX: ORTHO_FIXED_POSE.target.x,
  tgtY: ORTHO_FIXED_POSE.target.y,
  tgtZ: ORTHO_FIXED_POSE.target.z,
  toggleView: () => {
    isOrthoView = !isOrthoView;
    activeCamera = isOrthoView ? orthoCamera : mapPerspCamera;

    // 배경 처리
    if (isOrthoView) {
      // Ortho에서는 CubeTexture background를 끄고(흰 화면 이슈 회피),
      // blackSky.jpg를 사각형 그대로 Plane으로 띄운다.
      scene.background = null;
      ensureOrthoBackgroundPlane();
      updateOrthoBackgroundTiling();
    } else {
      // Perspective에서는 CubeTexture background 사용
      if (skyCubeTexture) scene.background = skyCubeTexture;
    }

    // When entering Ortho, stop any residual OrbitControls damping/inertia and snap to fixed pose
    if (isOrthoView) {
      enterOrthoAndFreeze();
      orbitControls.object = activeCamera;
      orbitControls.enabled = true;

      applyFixedPoseTo(activeCamera);
      commitOrthoHomeState();
    } else {
      orbitControls.object = activeCamera;
      orbitControls.enabled = true;

      // Perspective: keep targeting the map and move closer so the map size feels similar to Ortho
      applyControlsForView(); // sets target to mapFocusTarget
      applyPerspectiveClosePose();
    }

    applyControlsForView();

    cameraParams.mode = isOrthoView ? 'Orthographic' : 'Perspective';

    // Perspective에서는 캐릭터 숨김
    updateCharacterVisibility();
  },
};


function applyFixedPoseFromParams() {
  ORTHO_FIXED_POSE.cam.set(cameraParams.camX, cameraParams.camY, cameraParams.camZ);
  ORTHO_FIXED_POSE.target.set(cameraParams.tgtX, cameraParams.tgtY, cameraParams.tgtZ);

  // Apply to whichever camera is active right now
  if (activeCamera) {
    activeCamera.position.copy(ORTHO_FIXED_POSE.cam);
    activeCamera.lookAt(ORTHO_FIXED_POSE.target);
    activeCamera.updateProjectionMatrix();
  }
  if (orbitControls) {
    orbitControls.target.copy(ORTHO_FIXED_POSE.target);
    orbitControls.update();
  }
  commitOrthoHomeState();
}

function clearOrbitInertia() {
  // OrbitControls has internal deltas; clear them if present to avoid "residual velocity"
  try {
    if (orbitControls && orbitControls.sphericalDelta) orbitControls.sphericalDelta.set(0, 0, 0);
    if (orbitControls && orbitControls.panOffset) orbitControls.panOffset.set(0, 0, 0);
    if (orbitControls) orbitControls.scale = 1;
  } catch (_) {}
}


function commitOrthoHomeState() {
  // Make OrbitControls.reset() return to the current fixed ortho pose.
  if (!orbitControls || !orthoCamera) return;
  const prevObj = orbitControls.object;
  orbitControls.object = orthoCamera;

  // Force exact pose
  orthoCamera.position.copy(ORTHO_FIXED_POSE.cam);
  orthoCamera.lookAt(ORTHO_FIXED_POSE.target);
  orthoCamera.updateMatrixWorld(true);

  orbitControls.target.copy(ORTHO_FIXED_POSE.target);
  orbitControls.update();

  // Save as "home" (used by orbitControls.reset())
  if (typeof orbitControls.saveState === 'function') orbitControls.saveState();

  orbitControls.object = prevObj;
}

function enterOrthoAndFreeze() {
  // 1) kill any damping/inertia from perspective orbiting
  // 2) snap ortho camera to the fixed pose and keep it there
  if (!orbitControls) return;

  const prevDamping = orbitControls.enableDamping;
  orbitControls.enableDamping = false;

  clearOrbitInertia();

  // reset to last committed ortho home state (or whatever OrbitControls currently saved)
  if (typeof orbitControls.reset === 'function') orbitControls.reset();

  // enforce fixed pose again (reset can be slightly off when damping was active)
  applyFixedOrthoPose();

  orbitControls.update();
  orbitControls.enableDamping = prevDamping;
}


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

function applyControlsForView() {
  if (isOrthoView) {
    // overview: lock rotate/pan, allow zoom
    orbitControls.enableRotate = false;
    orbitControls.enablePan = false;
    orbitControls.enableZoom = true;
  } else {
    // perspective: orbit around the map (triangle_final.glb)
    orbitControls.enableRotate = true;
    orbitControls.enablePan = true;
    orbitControls.enableZoom = true;

    orbitControls.target.copy(mapFocusTarget);
  }
  orbitControls.enableDamping = true;
  orbitControls.enableKeys = false;
  orbitControls.update();
}

function applyPerspectiveClosePose() {
  // Place the perspective camera closer to the map center (mapFocusTarget),
  // keeping the same viewing direction as the current camera pose.
  const cam = mapPerspCamera;
  const target = mapFocusTarget.clone();

  const currentDist = cam.position.distanceTo(target);
  if (currentDist > 1e-6) {
    const dir = new THREE.Vector3().subVectors(cam.position, target).normalize(); // from target to cam
    const desiredDist = currentDist * PERS_CLOSE_FACTOR;
    cam.position.copy(target).add(dir.multiplyScalar(desiredDist));
  }
  cam.lookAt(target);
  cam.updateMatrixWorld(true);

  orbitControls.object = cam;
  orbitControls.target.copy(target);
  orbitControls.update();
}

function applyFixedPoseTo(cam) {
  cam.position.copy(ORTHO_FIXED_POSE.cam);
  orbitControls.target.copy(ORTHO_FIXED_POSE.target);

  cam.lookAt(orbitControls.target);
  cam.updateMatrixWorld(true);

  orbitControls.object = cam;
  orbitControls.update();
  // controls are set by view
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
  updateOrthoBackgroundTiling();

  renderer.setSize(w, h);

  // 시작 화면 렌더러도 리사이즈
  if (startScreenRenderer) startScreenRenderer.setSize(w, h);
  if (closeupCamera) {
    closeupCamera.aspect = asp;
    closeupCamera.updateProjectionMatrix();
  }

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
// const gui = new GUI();
const gui = null; // GUI disabled (GUI code is commented out below; behavior preserved via keyboard/logic)
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
// 우주선 애니메이션 관리
// =====================
const spaceShipAnimations = [];

// =====================
// triangle_final.glb 로드
// =====================
let mapRoot = null;

gltfLoader.load(
  './models/texture5.glb',
  (gltf) => {
    mapRoot = setupStaticModelNoCenter(gltf.scene);
    mapRoot.position.set(0, 0, 0);
    mapRoot.rotation.set(0, 0, 0);
    mapRoot.scale.setScalar(1);

    worldGroup.add(mapRoot);

    console.log('texture5.glb 로드 완료');

    // (1) 카메라를 맵 중심으로 평행이동 (고정 포즈 자체를 이동)
    recenterFixedPoseToMap(mapRoot);

    // (2) 초기 줌아웃 (조금 멀리)
    zoomOutFixedPose(4.0);

// (2.5) triangle_final.glb 를 카메라로부터 4배 더 멀리 (카메라->타겟 방향으로 '타겟 너머'로 이동)
{
  const cam = ORTHO_FIXED_POSE.cam.clone();
  const tgt = ORTHO_FIXED_POSE.target.clone();
  const dir = new THREE.Vector3().subVectors(tgt, cam);
  const dist = dir.length();
  if (dist > 1e-6) {
    dir.normalize();
    const delta = dir.multiplyScalar(dist * 3); // cam->(tgt+delta) = 4*dist
    mapRoot.position.add(delta);

    // Perspective orbit target: map center moved along the same line
    mapFocusTarget.copy(tgt).add(delta);
  } else {
    mapFocusTarget.copy(tgt);
  }
}


    // (3) 현재 뷰(초기: Ortho)에 고정 포즈 적용
    applyFixedPoseTo(activeCamera);

    // (4) 우주선 3개 추가 (배경에 살짝 보이게)
    loadSpaceAssets();
  },
  undefined,
  (err) => console.error('texture5.glb 로드 실패', err)
);

// =====================
// 우주선 3개 로드 및 배치
// - texture5.glb의 실제 위치 기준으로 상하좌우에 배치
// - worldGroup에 추가하여 맵과 함께 이동
// - Perspective에서도 보이도록 worldGroup에 추가
// - 각 우주선은 느린 속도로 서로 다른 방향으로 이동
// =====================
function loadSpaceAssets() {
  // texture5.glb(mapRoot)의 위치를 기준으로 상대 위치 계산
  if (!mapRoot) {
    console.error('mapRoot가 아직 로드되지 않았습니다.');
    return;
  }

  const mapPos = mapRoot.position.clone();
  
  const spaceShips = [
    { 
      file: './models/ufo.glb', 
      // 맵 기준 왼쪽 위 (스크린샷 왼쪽 상단 동그라미)
      position: new THREE.Vector3(mapPos.x - 12, mapPos.y + 8, mapPos.z + 8),
      scale: 0.5,
      rotation: new THREE.Euler(0, Math.PI / 4, 0),
      // 애니메이션: 원형 궤도 (시계 방향)
      animation: {
        type: 'orbit',
        radius: 2.0,
        speed: 0.15,
        axis: 'y'
      }
    },
    { 
      file: './models/low_poly_space_ship.glb', 
      // 맵 기준 오른쪽 (스크린샷 오른쪽 동그라미)
      position: new THREE.Vector3(mapPos.x + 15, mapPos.y + 5, mapPos.z + 3),
      scale: 0.4,
      rotation: new THREE.Euler(0, -Math.PI / 3, 0),
      // 애니메이션: 위아래 떠다님
      animation: {
        type: 'float',
        amplitude: 1.5,
        speed: 0.3,
        axis: 'y'
      }
    },
    { 
      file: './models/toy_rocket.glb', 
      // 맵 기준 아래쪽 (스크린샷 하단 동그라미)
      position: new THREE.Vector3(mapPos.x + 2, mapPos.y + 6, mapPos.z - 12),
      scale: 0.45,
      rotation: new THREE.Euler(Math.PI / 6, 0, 0),
      // 애니메이션: 8자 움직임
      animation: {
        type: 'figure8',
        radius: 1.8,
        speed: 0.2
      }
    }
  ];

  spaceShips.forEach((ship, index) => {
    gltfLoader.load(
      ship.file,
      (gltf) => {
        const model = setupStaticModelNoCenter(gltf.scene);
        
        // 위치, 크기, 회전 설정
        model.position.copy(ship.position);
        model.scale.setScalar(ship.scale);
        model.rotation.copy(ship.rotation);

        // worldGroup에 추가하여 맵과 함께 이동
        worldGroup.add(model);

        // 애니메이션 정보 저장
        spaceShipAnimations.push({
          model: model,
          startPos: ship.position.clone(),
          animation: ship.animation,
          time: Math.random() * Math.PI * 2 // 랜덤 시작 시간으로 비동기화
        });

        console.log(`${ship.file} 로드 완료 (${index + 1}/3) at position:`, ship.position);
      },
      undefined,
      (err) => console.error(`${ship.file} 로드 실패:`, err)
    );
  });
}

/* GUI (hidden):
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

camFolder.add(cameraParams, 'camX', -200, 200, 0.01).name('camX').onChange(applyFixedPoseFromParams);
camFolder.add(cameraParams, 'camY', -200, 200, 0.01).name('camY').onChange(applyFixedPoseFromParams);
camFolder.add(cameraParams, 'camZ', -200, 200, 0.01).name('camZ').onChange(applyFixedPoseFromParams);
camFolder.add(cameraParams, 'tgtX', -200, 200, 0.01).name('tgtX').onChange(applyFixedPoseFromParams);
camFolder.add(cameraParams, 'tgtY', -200, 200, 0.01).name('tgtY').onChange(applyFixedPoseFromParams);
camFolder.add(cameraParams, 'tgtZ', -200, 200, 0.01).name('tgtZ').onChange(applyFixedPoseFromParams);
camFolder.add({ applyPose: applyFixedPoseFromParams }, 'applyPose').name('Apply Pose');

camFolder.open();
*/

// =====================
// c키: GUI의 Toggle View 버튼과 동일한 효과
// =====================
document.addEventListener(
  'keydown',
  (e) => {
    const key = (e.key || '').toLowerCase();
    if (key !== 'c') return;
    if (isEventOnGUI(e)) return;

    // 1) view toggle
    if (cameraParams && typeof cameraParams.toggleView === 'function') {
      cameraParams.toggleView();
    } else {
      console.error('[C] cameraParams.toggleView 가 아직 준비되지 않았습니다.');
    }

    // 2) scenario advance (if scenario is in/after the "press C" step)
    try {
      const sm = (typeof window !== 'undefined' && window.scenarioManager) ? window.scenarioManager : null;
      const canAdvance =
        sm &&
        (sm.waitingForCKey === true || (typeof sm.currentStep === 'number' && sm.currentStep >= 9));

      if (canAdvance && typeof sm.onCKeyPressed === 'function') {
        sm.onCKeyPressed();
      }
    } catch (err) {
      console.error('[C] scenario advance error:', err);
    }

    e.preventDefault();
  },
  { capture: true }
);


// =====================
// Character (FBX + Animations)
// - astronaut.fbx + idle/walk/turn
// - w: walk(hold), t: turn180(one-shot)
// =====================
const CHAR_ASSET_PATH = './assets/models/';
const CHAR_FILE_MODEL = 'astronaut.fbx';
const CHAR_FILE_IDLE  = 'Standing W_Briefcase Idle.fbx';
const CHAR_FILE_WALK  = 'Walking.fbx';
const CHAR_FILE_TURN  = 'Turn180.fbx';

const CHAR_FADE = 0.18;

// base walk speed moved to params.walkSpeed


const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
const LOCAL_UP      = new THREE.Vector3(0, 1, 0);
const LOCAL_RIGHT   = new THREE.Vector3(1, 0, 0);

const CUBE_SIZE = 2;
const CUBE_HALF = CUBE_SIZE / 2;          // 1
let CUBE_TOP_Y = 7;                       // 캐릭터가 서 있는 "지면(상단)" 높이
const TARGET_CORNER_RAD = Math.PI / 2;    // 90deg


// Character group
const actorGroup = new THREE.Group();
worldGroup.add(actorGroup);
updateCharacterVisibility();


// Perspective에서는 캐릭터를 숨김
function updateCharacterVisibility() {
  if (typeof actorGroup !== 'undefined') {
    // 시작 화면이 활성화되어 있으면 항상 보임
    if (typeof isStartScreenActive !== 'undefined' && isStartScreenActive) {
      actorGroup.visible = true;
    } else {
      // 게임 시작 후에는 Ortho에서만 보임
      actorGroup.visible = !!isOrthoView;
    }
  }
}
// GUI params (character only)
const characterParams = {
  scale: 0.01,
  x: 0,
  y: 7, // ground height reference
  z: 0,
};
actorGroup.scale.setScalar(characterParams.scale);
actorGroup.position.set(characterParams.x, characterParams.y, characterParams.z);
CUBE_TOP_Y = characterParams.y;


// movement/corner params (ported from main7)
const params = {
  corner: false,
  turnSpeedDeg: 60,
  distance: 1,
  characterScale: characterParams.scale,
  walkSpeed: 120,
};

// Auto-corner checker (distance-based)
const cornerPosition = 9;
let walkedDistance = 3; // min 0, grows by walked distance, resets on auto-corner
let autoCornerArmed = false;
let autoCornerArmAt = 0;
const AUTO_CORNER_RELEASE_SEC = 0.5;

/* GUI (hidden):
const charFolder = gui.addFolder('Character');
charFolder.add(characterParams, 'scale', 0.001, 0.05, 0.001).name('scale').onChange((v) => {
  actorGroup.scale.setScalar(v);
  params.characterScale = v;
});
charFolder.add(characterParams, 'x', -50, 50, 0.01).name('x').onChange((v) => (actorGroup.position.x = v));
charFolder.add(characterParams, 'y', -10, 10, 0.01).name('y').onChange((v) => (actorGroup.position.y = v));
charFolder.add(characterParams, 'z', -50, 50, 0.01).name('z').onChange((v) => (actorGroup.position.z = v));
charFolder.add(params, 'walkSpeed', 0, 200, 1).name('walkSpeed');
charFolder.open();
*/

let cornerCtrl = null;

// movement/corner params (ported from main7)

// keep constants in sync with GUI
// charFolder.controllers?.forEach(() => {}); // no-op (lil-gui compat)
// charFolder.__controllers?.forEach(() => {}); // legacy no-op

// scale/y change hooks
// (we also keep params.characterScale + CUBE_TOP_Y aligned)
// const _scaleCtrl = charFolder.controllers?.find?.((c) => c._name === 'scale');
// const _yCtrl = charFolder.controllers?.find?.((c) => c._name === 'y');

/* GUI (hidden):
const cornerFolder = gui.addFolder('Corner');
cornerCtrl = cornerFolder.add(params, 'corner').name('corner');
cornerFolder.add(params, 'turnSpeedDeg', 10, 360, 1).name('turnSpeedDeg');
cornerFolder.add(params, 'distance', 0, 4, 0.01).name('distance');
cornerFolder.open();
*/

// Ensure camera pose params exist on cameraParams (for GUI numeric controls)
cameraParams.camX ??= ORTHO_FIXED_POSE.cam.x;
cameraParams.camY ??= ORTHO_FIXED_POSE.cam.y;
cameraParams.camZ ??= ORTHO_FIXED_POSE.cam.z;
cameraParams.tgtX ??= ORTHO_FIXED_POSE.target.x;
cameraParams.tgtY ??= ORTHO_FIXED_POSE.target.y;
cameraParams.tgtZ ??= ORTHO_FIXED_POSE.target.z;


cameraParams.mode = isOrthoView ? 'Orthographic' : 'Perspective';

/* GUI (hidden):
// Reuse existing camFolder (defined earlier in this file) to avoid redeclaration.
camFolder.add(cameraParams, 'toggleView').name('Toggle View');
camFolder.add(cameraParams, 'mode').name('Mode').listen();
camFolder.open();
*/


// FBX loader helpers
const fbxLoader = new FBXLoader();
fbxLoader.setPath(CHAR_ASSET_PATH);

function loadFBX(filename) {
  return new Promise((resolve, reject) => {
    fbxLoader.load(filename, resolve, undefined, reject);
  });
}

// Animation state
let characterRoot = null;
let mixer = null;

const actions = { idle: null, walk: null, turn: null };
let currentAction = null;

let wDown = false;
let isTurning = false;

let isLeft = true; // initial True

// corner state (ported from main7)
let cornerActive = false;
let cornerAngle = 0;
const cornerStartPos = new THREE.Vector3();
const cornerStartQuat = new THREE.Quaternion();
const cornerEndQuat = new THREE.Quaternion();
const F0 = new THREE.Vector3();
const U0 = new THREE.Vector3();
const R0 = new THREE.Vector3();
const pivotW0 = new THREE.Vector3();

const cornerStartSoleW = new THREE.Vector3();
const cornerTargetSoleW = new THREE.Vector3();


const WORLD_UP = new THREE.Vector3(0, 1, 0);
const q180 = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, Math.PI);
const turnStartQuat = new THREE.Quaternion();
const turnEndQuat = new THREE.Quaternion();
let turnDuration = 0;

const charClock = new THREE.Clock();
let soleLocalY = 0;

function switchAction(next, fade = CHAR_FADE) {
  if (!next || next === currentAction) return;

  next.enabled = true;
  next.reset();
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  next.play();

  if (currentAction) currentAction.crossFadeTo(next, fade, false);
  else next.fadeIn(fade);

  currentAction = next;
}

function enforceLocomotionEachFrame() {
  if (isTurning) return;
  const desired = wDown ? actions.walk : actions.idle;
  if (desired && desired !== currentAction) switchAction(desired);
}


function getSoleWorld() {
  const soleLocal = new THREE.Vector3(0, soleLocalY * params.characterScale, 0);
  return actorGroup.localToWorld(soleLocal);
}





// Sole position expressed in worldGroup's local space (so drag-translation doesn't break corner walking)
function getSoleWorldGroup() {
  const soleLocal = new THREE.Vector3(0, soleLocalY * params.characterScale, 0);
  const soleWorld = actorGroup.localToWorld(soleLocal);
  return worldGroup.worldToLocal(soleWorld);
}
function beginCornerIfNeeded() {
  if (cornerActive) return;
  if (!params.corner) return;
  if (!wDown) return;
  if (isTurning) return;
  if (currentAction !== actions.walk) return;

  cornerActive = true;
  cornerAngle = 0;

  cornerStartPos.copy(actorGroup.position);
  cornerStartQuat.copy(actorGroup.quaternion);

  F0.copy(LOCAL_FORWARD).applyQuaternion(cornerStartQuat).normalize();
  U0.copy(LOCAL_UP).applyQuaternion(cornerStartQuat).normalize();
  R0.copy(LOCAL_RIGHT).applyQuaternion(cornerStartQuat).normalize();

  // pivot: top center에서 F0 방향으로 half만큼 이동한 top-front edge center
  const topCenterW = new THREE.Vector3(actorGroup.position.x, CUBE_TOP_Y, actorGroup.position.z);
  pivotW0.copy(topCenterW).addScaledVector(F0, CUBE_HALF);

  // build end orientation (absolute) so that the final basis matches the requested mapping
  // isLeft==true  : end = pitch(+90 around R0) then yaw(+90 around F0)
  // isLeft==false : final up = -R0 and final forward = -U0 (=> right = +F0)
  if (isLeft) {
    const qPitch = new THREE.Quaternion().setFromAxisAngle(R0, TARGET_CORNER_RAD);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(F0, TARGET_CORNER_RAD);
    cornerEndQuat.copy(cornerStartQuat).premultiply(qPitch).premultiply(qYaw);
  } else {
    const rightEnd = new THREE.Vector3().copy(F0);
    const upEnd = new THREE.Vector3().copy(R0).multiplyScalar(-1);
    const forwardEnd = new THREE.Vector3().copy(U0).multiplyScalar(-1);
    const m = new THREE.Matrix4().makeBasis(rightEnd, upEnd, forwardEnd);
    cornerEndQuat.setFromRotationMatrix(m);
  }

  // start/target sole positions (worldGroup local space)
  cornerStartSoleW.copy(getSoleWorldGroup());

  // target: corner 시작 지점(sole) 기준 "상대 오프셋"
  const d = params.distance;
  const s = isLeft ? +1 : -1;

  cornerTargetSoleW
    .copy(cornerStartSoleW)
    .addScaledVector(R0, s * d)
    .addScaledVector(U0, -d)
    .addScaledVector(F0, +d);
}

function endCorner() {
  cornerActive = false;
  params.corner = false;
  if (cornerCtrl && cornerCtrl.updateDisplay) cornerCtrl.updateDisplay();
}

function startTurn() {
  // corner가 체크/진행 중이면 뒤로 돌기 금지
  if (params.corner || cornerActive) return;
  if (!actions.turn || isTurning) return;
  isLeft = !isLeft;

  isTurning = true;

  turnStartQuat.copy(actorGroup.quaternion);
  turnEndQuat.copy(turnStartQuat).multiply(q180);

  actions.turn.enabled = true;
  actions.turn.reset();
  actions.turn.setLoop(THREE.LoopOnce, 1);
  actions.turn.clampWhenFinished = true;
  actions.turn.setEffectiveTimeScale(1);
  actions.turn.setEffectiveWeight(1);

  switchAction(actions.turn);
}

function onMixerFinished(e) {
  if (!isTurning) return;
  if (e?.action !== actions.turn) return;

  actorGroup.quaternion.copy(turnEndQuat);
  isTurning = false;
  enforceLocomotionEachFrame();
}

function inferYawBoneName(clip, modelRoot) {
  for (const tr of clip.tracks) {
    if (!tr.name.endsWith('.quaternion')) continue;
    const nodeName = tr.name.split('.')[0];
    const obj = modelRoot.getObjectByName(nodeName);
    if (obj && obj.isBone) return nodeName;
  }
  for (const tr of clip.tracks) {
    if (tr.name.endsWith('.quaternion')) return tr.name.split('.')[0];
  }
  return null;
}

function stripQuaternionTracksForNode(clip, nodeName) {
  if (!nodeName) return clip;
  const kept = [];
  for (const tr of clip.tracks) {
    if (tr.name === `${nodeName}.quaternion`) continue;
    kept.push(tr);
  }
  const stripped = new THREE.AnimationClip(clip.name, clip.duration, kept);
  stripped.resetDuration();
  return stripped;
}



async function initCharacter() {
  characterRoot = await loadFBX(CHAR_FILE_MODEL);

  characterRoot.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = false;
    }
  });

  actorGroup.add(characterRoot);

  // infer sole (min y) in local space for ground placement
  const box = new THREE.Box3().setFromObject(characterRoot);
  soleLocalY = box.min.y;

  // place so sole touches y = characterParams.y
  actorGroup.updateMatrixWorld(true);
  const soleW = getSoleWorld();
  actorGroup.position.y += (characterParams.y - soleW.y);
  actorGroup.updateMatrixWorld(true);

  mixer = new THREE.AnimationMixer(characterRoot);
  mixer.addEventListener('finished', onMixerFinished);

  const idleObj = await loadFBX(CHAR_FILE_IDLE);
  const walkObj = await loadFBX(CHAR_FILE_WALK);
  const turnObj = await loadFBX(CHAR_FILE_TURN);

  actions.idle = mixer.clipAction(idleObj.animations[0]);
  actions.walk = mixer.clipAction(walkObj.animations[0]);

  const rawTurnClip = turnObj.animations[0];
  const yawBoneName = inferYawBoneName(rawTurnClip, characterRoot);
  const strippedTurnClip = stripQuaternionTracksForNode(rawTurnClip, yawBoneName);

  actions.turn = mixer.clipAction(strippedTurnClip);
  turnDuration = strippedTurnClip.duration;

  actions.idle.setLoop(THREE.LoopRepeat);
  actions.walk.setLoop(THREE.LoopRepeat);

  wDown = false;
  isTurning = false;
  switchAction(actions.idle, 0);
}

initCharacter().catch((err) => console.error(err));

// Input (character only)
// NOTE:
// Ortho <-> Perspective 토글을 반복하면, 어떤 환경에서는 OrbitControls/GUI 쪽 key handler가
// bubble 단계에서 이벤트를 소비해서 w/t가 안 먹는 현상이 생길 수 있다.
// 그래서 'capture' 단계에서 먼저 잡아서(가장 먼저 실행) Ortho일 때만 처리한다.
window.addEventListener('blur', () => {
  wDown = false;
});

// capture 단계에서 먼저 처리
document.addEventListener(
  'keydown',
  (e) => {
    if (!isOrthoView) return;

    const key = (e.key || '').toLowerCase();
    if (key === 'w') {
      wDown = true;
      e.preventDefault();
    }
    if (key === 't') {
      if (!params.corner && !cornerActive) startTurn();
      e.preventDefault();
    }
  },
  { capture: true }
);

document.addEventListener(
  'keyup',
  (e) => {
    if (!isOrthoView) return;

    const key = (e.key || '').toLowerCase();
    if (key === 'w') {
      wDown = false;
      e.preventDefault();
    }
  },
  { capture: true }
);


// ------- 렌더 루프 -------
function render() {

  // Ortho이면 패널 업데이트
  if (isOrthoView) updateOrthoDebug();
  if (orbitControls.enabled) orbitControls.update();

  // character animation update
  const dtChar = charClock.getDelta();
  if (mixer) mixer.update(dtChar);

  // =====================
  // 우주선 애니메이션 업데이트
  // =====================
  spaceShipAnimations.forEach((shipAnim) => {
    shipAnim.time += dtChar;
    const anim = shipAnim.animation;
    const t = shipAnim.time * anim.speed;

    if (anim.type === 'orbit') {
      // 원형 궤도 (XZ 평면 또는 다른 평면)
      if (anim.axis === 'y') {
        shipAnim.model.position.x = shipAnim.startPos.x + Math.cos(t) * anim.radius;
        shipAnim.model.position.y = shipAnim.startPos.y;
        shipAnim.model.position.z = shipAnim.startPos.z + Math.sin(t) * anim.radius;
      }
    } else if (anim.type === 'float') {
      // 위아래 떠다님
      shipAnim.model.position.x = shipAnim.startPos.x;
      shipAnim.model.position.y = shipAnim.startPos.y + Math.sin(t) * anim.amplitude;
      shipAnim.model.position.z = shipAnim.startPos.z;
    } else if (anim.type === 'figure8') {
      // 8자 움직임 (Lissajous curve)
      shipAnim.model.position.x = shipAnim.startPos.x + Math.sin(t) * anim.radius;
      shipAnim.model.position.y = shipAnim.startPos.y + Math.sin(t * 2) * anim.radius * 0.5;
      shipAnim.model.position.z = shipAnim.startPos.z + Math.cos(t) * anim.radius;
    }
  });

  if (actions.idle && actions.walk && actions.turn) enforceLocomotionEachFrame();

  // turn180: keep actorGroup orientation synced to start/end quats during the clip
  if (isTurning && actions.turn && turnDuration > 0) {
    const t = actions.turn.time;
    const a = Math.min(Math.max(t / turnDuration, 0), 1);
    actorGroup.quaternion.copy(turnStartQuat).slerp(turnEndQuat, a);
  }

if (!isTurning) beginCornerIfNeeded();

// auto-corner can be released automatically if it doesn't actually start soon
if (autoCornerArmed && !cornerActive) {
  const waited = charClock.elapsedTime - autoCornerArmAt;
  if (waited >= AUTO_CORNER_RELEASE_SEC) {
    params.corner = false;
    autoCornerArmed = false;
    if (cornerCtrl && cornerCtrl.updateDisplay) cornerCtrl.updateDisplay();
  }
}

  if (characterRoot && !isTurning && wDown && currentAction === actions.walk) {
    if (!cornerActive) {
      const forward = LOCAL_FORWARD.clone().applyQuaternion(actorGroup.quaternion).normalize();
      const step = (params.walkSpeed * params.characterScale) * dtChar;
      actorGroup.position.addScaledVector(forward, step);

      // Auto-corner distance accumulation (no change while cornering/turning)
// - isLeft == true  : walkedDistance increases, triggers at > cornerPosition then resets to 0
// - isLeft == false : walkedDistance decreases, triggers at 0 then resets to cornerPosition
      let shouldAutoCorner = false;
      if (isLeft) {
        walkedDistance = Math.max(0, walkedDistance + step);
        if (walkedDistance > cornerPosition) {
          walkedDistance = 0;
          shouldAutoCorner = true;
        }
      } else {
        walkedDistance = Math.max(0, walkedDistance - step);
        if (walkedDistance <= 0) {
          walkedDistance = cornerPosition;
          shouldAutoCorner = true;
        }
      }

      if (shouldAutoCorner) {

        // arm an auto-corner check (can auto-release if it doesn't start)
        params.corner = true;
        autoCornerArmed = true;
        autoCornerArmAt = charClock.elapsedTime;

        if (cornerCtrl && cornerCtrl.updateDisplay) cornerCtrl.updateDisplay();
      }

      actorGroup.updateMatrixWorld(true);
    } else {
      const angStep = THREE.MathUtils.degToRad(params.turnSpeedDeg) * dtChar;
      cornerAngle = Math.min(cornerAngle + angStep, TARGET_CORNER_RAD);
      const alpha = cornerAngle / TARGET_CORNER_RAD;

      // 1) absolute pose: reset to start, then apply axis rotations
      actorGroup.position.copy(cornerStartPos);
      actorGroup.quaternion.copy(cornerStartQuat);

      if (isLeft) {
        actorGroup.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(R0, cornerAngle));
        actorGroup.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(F0, +cornerAngle));
      } else {
        actorGroup.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(F0, -cornerAngle));
        actorGroup.quaternion.premultiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().copy(R0).multiplyScalar(-1), +cornerAngle)
        );
        actorGroup.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(F0, Math.PI * alpha));
      }
      actorGroup.updateMatrixWorld(true);

      // 2) sole target follows a quarter-circle trajectory
      const d = params.distance;
      const pivot = new THREE.Vector3().copy(cornerStartSoleW).addScaledVector(U0, -d);

      const v = new THREE.Vector3().copy(U0).multiplyScalar(d);
      v.applyAxisAngle(R0, cornerAngle);

      const yawSign = isLeft ? +1 : -1;
      const lateral = new THREE.Vector3().copy(R0).multiplyScalar(yawSign * d * Math.sin(cornerAngle));

      const desiredSole = pivot.add(v).add(lateral);
      const curSole = getSoleWorldGroup();
      const delta = desiredSole.sub(curSole);
      actorGroup.position.add(delta);
      actorGroup.updateMatrixWorld(true);

      if (cornerAngle >= TARGET_CORNER_RAD - 1e-8) endCorner();
    }
  }

  if (isOrthoView) {
    // Ortho: scene.background를 끄고(이미 적용됨), 화면 고정 쿼드를 먼저 렌더링
    updateOrthoBackgroundTiling();
    renderer.autoClear = false;
    renderer.clear();
    if (orthoBgScene && orthoBgCam) renderer.render(orthoBgScene, orthoBgCam);
    renderer.clearDepth();
    renderer.render(scene, activeCamera);
  } else {
    renderer.autoClear = true;
    renderer.render(scene, activeCamera);
  }

  
  // =====================
  // 시작 화면 클로즈업 렌더링
  // =====================
  if (isStartScreenActive && characterRoot && actorGroup.visible) {
    // 클로즈업 카메라 위치를 캐릭터에 맞춰 업데이트
    const characterWorldPos = new THREE.Vector3();
    actorGroup.getWorldPosition(characterWorldPos);

    // 캐릭터 얼굴 높이/거리 (스케일 고려)
    const faceHeight = 160 * params.characterScale;
    const cameraDistance = 250 * params.characterScale;

    closeupCamera.position.set(
      characterWorldPos.x,
      characterWorldPos.y + faceHeight,
      characterWorldPos.z + cameraDistance
    );
    closeupCamera.lookAt(
      characterWorldPos.x,
      characterWorldPos.y + faceHeight,
      characterWorldPos.z
    );

    startScreenRenderer.render(scene, closeupCamera);
  }

  requestAnimationFrame(render);
}
render();

// 초기 1회: 고정 pose 적용 (맵 로드 전이므로, 맵 로드 후 recenter/zoomout이 다시 적용됨)
applyFixedPoseTo(orthoCamera);
