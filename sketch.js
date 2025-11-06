// ✅ p5.js + ml5@1 FaceMesh 안정판 (mediapipe runtime + 준비 후 시작)
let video,
  faceMesh,
  faces = [];
let nftImg;
let loading = true;
let videoError = false;

let changeBtn;
let isLoading = false; // 버튼 중복 클릭 방지용

const W = 640*1.8;
const H = 480*1.8;
const TEZOS_ADDRESS = "tz1Q27zCCC5eZDQcF4BTY49ToukPHzhWQsAY";

function initFaceMesh() {
  // 2) runtime을 mediapipe로 고정 + 모델 준비 콜백에서 detectStart
  faceMesh = ml5.faceMesh(
    {
      maxFaces: 1,
      refineLandmarks: true,
      flipHorizontal: true,
      runtime: "mediapipe",
    },
    () => {
      console.log("✅ FaceMesh ready (mediapipe)");
      faceMesh.detectStart(video, gotFaces);
    }
  );
}

function gotFaces(results) {
  faces = results;
}

function draw() {
  background(0);

  // ✅ 웹캠 에러가 있으면 메시지만 표시
  if (videoError) {
    if (loading) {
      drawLabel(width / 2, 20, "Loading NFT…");
    } else {
      drawLabel(width / 2, height / 2, "⚠️ 웹캠을 사용할 수 없습니다.");
    }
    return;
  }

  // ✅ video가 없으면 리턴
  if (!video) {
    drawLabel(width / 2, height / 2, "웹캠을 초기화하는 중...");
    return;
  }

  // 거울 모드 출력 (flipHorizontal 좌표와 일치)
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0, W, H);
  pop();

  if (loading) drawLabel(width / 2, 20, "Loading NFT…");
  if (!faces.length) {
    drawLabel(width / 2, height - 20, "Show your face…");
    return;
  }

  const face = faces[0];
  if (!face.keypoints || face.keypoints.length < 478) return; // iris 필요

  // 눈/각도/스케일 계산
  const L_IRIS = [468, 469, 470, 471, 472];
  const R_IRIS = [473, 474, 475, 476, 477];
  const LEFT_OUTER = 33,
    RIGHT_OUTER = 362;

  const l = centroid(face.keypoints, L_IRIS);
  const r = centroid(face.keypoints, R_IRIS);

  const lx = face.keypoints[LEFT_OUTER].x,
    ly = face.keypoints[LEFT_OUTER].y;
  const rx = face.keypoints[RIGHT_OUTER].x,
    ry = face.keypoints[RIGHT_OUTER].y;

  const angle = atan2(ly - ry, lx - rx);
  const eyeDist = dist(lx, ly, rx, ry);
  const size = eyeDist * 0.7;
  // const cx = (l.x + r.x) * 0.5;
  // const cy = (l.y + r.y) * 0.5;
  const cx = l.x;
  const cy = l.y;

  // NFT 표시
  // ✅ nftImg가 로드되었는지 확인
  if (!nftImg) {
    drawLabel(width / 2, 20, "Loading NFT…");
    return;
  }
  
  // 왼쪽 눈
  push();
  translate(l.x, l.y);
  rotate(angle);
  scale(1, -1);
  imageMode(CENTER);
  image(nftImg, 0, 0, size, size); // size는 그대로 써도 되고, 왼눈 폭 기준으로 따로 계산해도 됨
  pop();

  // 오른쪽 눈
  push();
  translate(r.x, r.y);
  rotate(angle);
  scale(-1, -1);
  imageMode(CENTER);
  image(nftImg, 0, 0, size, size);
  pop();
}

// --- helpers ---
function centroid(points, idxs) {
  let sx = 0,
    sy = 0;
  for (const i of idxs) {
    sx += points[i].x;
    sy += points[i].y;
  }
  const n = idxs.length;
  return { x: sx / n, y: sy / n };
}
function drawLabel(x, y, msg) {
  noStroke();
  fill(0, 150);
  rectMode(CENTER);
  rect(x, y, textWidth(msg) + 20, 26, 6);
  fill(255);
  text(msg, x, y);
}
async function loadRandomNFT() {
  loading = true;
  try {
    const url = `https://api.tzkt.io/v1/tokens/balances?account=${TEZOS_ADDRESS}&token.standard=fa2&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API 응답 오류: ${res.status}`);
    const data = await res.json();
    const withMeta = data.filter((d) => d?.token?.metadata);
    if (!withMeta.length) throw new Error("No NFTs with metadata");
    const pick = withMeta[Math.floor(Math.random() * withMeta.length)];
    const md = pick.token.metadata;

    let media =
      md.artifactUri ||
      md?.formats?.[0]?.uri ||
      md.displayUri ||
      md.thumbnailUri;
    if (!media) throw new Error("No media URL");
    if (media.startsWith("ipfs://"))
      media = media.replace("ipfs://", "https://ipfs.io/ipfs/");

    const mime = md?.formats?.[0]?.mimeType || "";
    const looksVideo = mime.startsWith("video") || /\.(mp4|webm)$/i.test(media);
    if (looksVideo) {
      let fb = md.displayUri || md.thumbnailUri;
      if (fb?.startsWith("ipfs://"))
        fb = fb.replace("ipfs://", "https://ipfs.io/ipfs/");
      if (fb) media = fb;
    }

    // ✅ loadImage를 Promise로 감싸서 실제 로드 완료를 기다림
    await new Promise((resolve, reject) => {
      loadImage(
        media,
        (img) => {
          nftImg = img;
          loading = false;
          resolve(img);
        },
        (err) => {
          console.warn("Image load failed", err);
          loading = false;
          reject(err);
        }
      );
    });
  } catch (e) {
    console.error("NFT 로드 실패:", e);
    loading = false;
    throw e; // Promise.reject 대신 throw 사용
  }
}

function setup() {
  const cnv = createCanvas(W, 700);
  cnv.parent('stage');
  textFont("monospace");
  textAlign(CENTER, CENTER);

  // ✅ HTTPS 체크 및 웹캠 접근 시도
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    videoError = true;
    loadRandomNFT().catch(err => console.error("NFT 로드 실패:", err));
    setupButton();
    return;
  }

  try {
    video = createCapture(VIDEO);
    video.size(W, H);
    video.hide();

    // ✅ 웹캠 에러 처리
    video.elt.onerror = (err) => {
      console.error("웹캠 접근 실패:", err);
      videoError = true;
    };

    // p5.MediaElement 내부 <video> 엘리먼트가 메타데이터를 로드할 때
    video.elt.onloadedmetadata = () => {
      initFaceMesh();
    };
  } catch (err) {
    console.error("createCapture 실패:", err);
    videoError = true;
  }

  loadRandomNFT().catch(err => console.error("NFT 로드 실패:", err));
  setupButton();
}

function setupButton() {
  // ✅ 버튼 클릭 시 새로운 NFT 불러오기
  const changeBtn = document.getElementById('changeBtn');
  if (changeBtn) {
    changeBtn.addEventListener('click', () => {
      if (isLoading) return;
      isLoading = true;
      changeBtn.textContent = "Loading...";
      changeBtn.disabled = true;

      loadRandomNFT().then(() => {
        changeBtn.textContent = "give me other eyes";
        changeBtn.disabled = false;
        isLoading = false;
      }).catch(() => {
        changeBtn.textContent = "give me other eyes";
        changeBtn.disabled = false;
        isLoading = false;
      });
    });
  }
}