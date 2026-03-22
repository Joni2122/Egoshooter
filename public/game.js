// Verbindung zum Server
const socket = new WebSocket(`ws://${location.host}`);

let playerId = null;
let players = {};
let scene, camera, renderer, controls;
let keys = {};

// THREE.js Setup
function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("canvas") });
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Pointer Lock Controls (Ego-Perspektive)
  controls = new THREE.PointerLockControls(camera, document.body);

  document.body.addEventListener("click", () => {
    controls.lock();
  });

  // Boden
  const floorGeo = new THREE.PlaneGeometry(200, 200);
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  animate();
}

// Bewegung
function updateMovement() {
  if (!controls.isLocked) return;

  const speed = 0.1;
  const direction = new THREE.Vector3();

  if (keys["w"]) direction.z -= speed;
  if (keys["s"]) direction.z += speed;
  if (keys["a"]) direction.x -= speed;
  if (keys["d"]) direction.x += speed;

  controls.moveRight(direction.x);
  controls.moveForward(direction.z);

  sendPlayerState();
}

// WebSocket Events
socket.onmessage = (msg) => {
  const data = JSON.parse(msg.data);

  if (data.type === "init") {
    playerId = data.id;

    data.players.forEach(p => {
      players[p.id] = createPlayerModel(p.id);
      updatePlayerModel(p);
    });
  }

  if (data.type === "player_join") {
    players[data.player.id] = createPlayerModel(data.player.id);
    updatePlayerModel(data.player);
  }

  if (data.type === "player_state") {
    updatePlayerModel(data.player);
  }

  if (data.type === "player_leave") {
    if (players[data.id]) {
      scene.remove(players[data.id]);
      delete players[data.id];
    }
  }
};

// Spieler-Modell (einfacher Würfel)
function createPlayerModel(id) {
  const geo = new THREE.BoxGeometry(1, 2, 1);
  const mat = new THREE.MeshBasicMaterial({ color: id === playerId ? 0x00ff00 : 0xff0000 });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  return mesh;
}

function updatePlayerModel(p) {
  if (!players[p.id]) return;
  players[p.id].position.set(p.x, p.y - 1, p.z);
  players[p.id].rotation.y = p.rotY;
}

// Zustand an Server senden
function sendPlayerState() {
  const pos = controls.getObject().position;
  const rotY = controls.getObject().rotation.y;

  socket.send(JSON.stringify({
    type: "update_state",
    x: pos.x,
    y: pos.y,
    z: pos.z,
    rotY
  }));
}

// Animation Loop
function animate() {
  requestAnimationFrame(animate);
  updateMovement();
  renderer.render(scene, camera);
}

// Tastatur
document.addEventListener("keydown", (e) => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", (e) => keys[e.key.toLowerCase()] = false);

init();
// Schießen
document.addEventListener("mousedown", () => {
  if (!controls.isLocked) return;

  const origin = controls.getObject().position.clone();
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);

  // Schuss an Server senden
  socket.send(JSON.stringify({
    type: "shoot",
    origin,
    dir: { x: direction.x, y: direction.y, z: direction.z }
  }));

  createMuzzleFlash(origin, direction);
  checkHit(origin, direction);
});

// Trefferprüfung (sehr simpel)
function checkHit(origin, direction) {
  const ray = new THREE.Raycaster(origin, direction);
  const targets = Object.keys(players)
    .filter(id => id !== playerId)
    .map(id => players[id]);

  const hits = ray.intersectObjects(targets);

  if (hits.length > 0) {
    const hit = hits[0];

    socket.send(JSON.stringify({
      type: "hit",
      targetId: hit.object.userData.id,
      damage: 20
    }));
  }
}

// Mündungsfeuer
function createMuzzleFlash(origin, direction) {
  const flashGeo = new THREE.SphereGeometry(0.1, 8, 8);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  const flash = new THREE.Mesh(flashGeo, flashMat);

  flash.position.copy(origin).add(direction.clone().multiplyScalar(0.5));
  scene.add(flash);

  setTimeout(() => scene.remove(flash), 80);
}

// Server-Schüsse anzeigen
socket.addEventListener("message", (msg) => {
  const data = JSON.parse(msg.data);

  if (data.type === "shot_fired" && data.id !== playerId) {
    const origin = new THREE.Vector3(data.origin.x, data.origin.y, data.origin.z);
    const dir = new THREE.Vector3(data.dir.x, data.dir.y, data.dir.z);

    createMuzzleFlash(origin, dir);
  }

  if (data.type === "player_hit") {
    if (players[data.player.id]) {
      console.log("Spieler getroffen:", data.player.id, "HP:", data.player.health);
    }
  }
});

