// SSE 643: Capstone Project
// Interdimensional Pool: Classic pool with a couple twists such as pool guns, powerups, and ball portals once the balls are pocketed.
// Michael Young

import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { OBJLoader , GLTFLoader} from 'three/examples/jsm/Addons.js'
import CannonDebugger from 'cannon-es-debugger'
import Stats from 'stats.js'
import {Howl} from 'howler'

// Create top-level environments ==============================================
const scene = new THREE.Scene();

const world = new CANNON.World({gravity: new CANNON.Vec3(0,-9.81, 0)});
world.solver.iterations = 20;

// Initailize important things ================================================
let aspect = window.innerWidth / window.innerHeight;
const viewSize = 2;
const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
const cameraOrth = new THREE.OrthographicCamera(viewSize * aspect / -2, viewSize * aspect / 2, viewSize / 2, viewSize / -2, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.shadowMap.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

// Debugging Helpers ==========================================================

const axesHelper = new THREE.AxesHelper(0.1);
scene.add(axesHelper);

const cannonDebugger = new CannonDebugger(scene, world, {color: 0x00ff00, scale: 1.0});

const stats = new Stats();
document.body.appendChild(stats.dom);

// Loaders ====================================================================
const textureLoader = new THREE.TextureLoader();
const objectLoader = new OBJLoader();
const gltfLoader = new GLTFLoader();

//Window Resize handler
window.addEventListener('resize', () => {
    aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    cameraOrth.left = viewSize * aspect / -2;
    cameraOrth.right = viewSize * aspect / 2;
    cameraOrth.top = viewSize / 2;
    cameraOrth.bottom = viewSize / -2;
    camera.updateProjectionMatrix();
    cameraOrth.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

//=============================================================================
// Enviromnet Variables =======================================================
var orthoCam = false;
var pool_balls = [[],[]];
var playerCount = 1; //single player default

// Constants
const poolBallMass = 0.170; //170 grams or 6oz
const poolBallDiameter = 0.057; //57mm or 2 1/4 inch
const tableLength = 2.24; //224cm or 88inch
const tableWidth = tableLength/2; //112cm or 44inch
const cueBallDefaultPosition = {x: tableLength*2/4, y: poolBallDiameter/2, z: 0};

const ballMaterial = new CANNON.Material("ball");
const groundMaterial = new CANNON.Material("ground");
const bumperMaterial = new CANNON.Material("bumper");

const ballContactMaterial = new CANNON.ContactMaterial(ballMaterial,ballMaterial,{
    contactEquationRelaxation: 2,
    friction: 0.7,
    restitution: 0.85
});
const ball_ground = new CANNON.ContactMaterial(groundMaterial, ballMaterial, {
    friction: 0.6,
});
const ball_bumper = new CANNON.ContactMaterial(bumperMaterial, ballMaterial, {
    contactEquationRelaxation: 2,
    friction: 0.5,
    restitution: 0.7
});

// Add the contact materials to the world
world.addContactMaterial(ballContactMaterial);
world.addContactMaterial(ball_ground);
world.addContactMaterial(ball_bumper);

const teleportCooldowns = {};

//=============================================================================
//=============================================================================

// Set camera & Lighting=======================================================
camera.position.set(0,2,1);

cameraOrth.position.set(0,2,0);
cameraOrth.position.x += 0.5588;
cameraOrth.lookAt(0.5588,0,0);

// Background
scene.background = new THREE.Color(0x444444);
genSky();

// Ambient Light
const light = new THREE.AmbientLight(0xaaaaaa, 1);
light.name = "AmbientLight";
scene.add(light);

// Mini Sun Light
const miniSunLight = new THREE.PointLight(0xffffff, 3);
miniSunLight.name = "DirectionalLight";
miniSunLight.castShadow = true;
miniSunLight.shadow.mapSize.width = 4096; // default
miniSunLight.shadow.mapSize.height = 4096; // default
miniSunLight.shadow.camera.near = 0.5; // default
miniSunLight.shadow.camera.far = 500; // default

// Portal Light
const portalColor = new THREE.Color(0x00ffff);
const portalLight = new THREE.PointLight(portalColor, 1, 1, 0.75);
portalLight.name = "PortalLight";

function genSky(){
    const skyGeo = new THREE.SphereGeometry(15,128,128);
    const skyMat = new THREE.MeshBasicMaterial({
        map: textureLoader.load("assets/stars.jpg"),
        side: THREE.BackSide
    })
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.name = "sky";
    sky.rotateOnAxis(new THREE.Vector3(0.4, 0, 0.4), Math.PI*1/4)
    scene.add(sky);
}

//=============================================================================
//=============================================================================

// Function to get image maps
function getTexture(index) {
    var file_path = "assets/pool_balls/texture_"+index+".png";
    const texture = textureLoader.load(file_path);  // Make sure the path is correct
    return texture;
}

// Play a sound
function playSound(path, volume){
    var sound = new Howl({
        src: [path],
        volume: volume
    })
    sound.play()
}

function addShadow(mesh, cast, receive){
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
}

// Pool Balls =================================================================
// Function to create pool ball meshes
function gen_pool_ball(ball){
    const ballGeo = new THREE.SphereGeometry(poolBallDiameter/2,32,32);
    const ballMat = new THREE.MeshStandardMaterial({
        map: getTexture(ball),
        roughness: 0.05
    });
    const ballModel = new THREE.Mesh(ballGeo, ballMat);
    ballModel.name = ball.toString() + "_ball";
    if (ball == 0) ballModel.name = "cue_ball";
    ballModel.castShadow = true;
    ballModel.receiveShadow = true;
    scene.add(ballModel);
}

// Create physics object for pool balls
function gen_phys_pool_ball(ball, rack_pos){
    var pos = new CANNON.Vec3(rack_pos.x,rack_pos.y,rack_pos.z);
    //if (ball == "cue_ball") pos.set(tableLength*2/4, poolBallDiameter/2, 0);
    const ballShape = new CANNON.Sphere(poolBallDiameter/2);
    const ballBody = new CANNON.Body({
        mass: poolBallMass,
        linearDamping: 0.5,
        angularDamping: 0.5,
        position: pos,
        shape: ballShape,
        material: ballMaterial
    });
    ballBody.name = ball;
    ballBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),Math.PI*-1/2);
    world.addBody(ballBody);
}

// Sync mesh and body positions
function sync_model(model, cannonBody){
    model.position.copy(cannonBody.position);
    model.quaternion.copy(cannonBody.quaternion);
}

// Generate pool ball position array
function generatePoolBallPositions(radius) {
    const positions = [];
    let startX = 0; // frontmost ball position
    let rows = 5;
    for (let row = 0; row < rows; row++) {
        let numBalls = row + 1;
        let rowX = startX - row * radius * 2 * Math.sin(Math.PI / 3);
        let rowZStart = -((numBalls - 1) * radius * 2) / 2;

        for (let i = 0; i < numBalls; i++) {
            let posX = rowX;
            let posZ = rowZStart + i * radius * 2;
            positions.push({x: posX, y: radius, z: posZ});
        }
    }
    return positions;
}

// Randomize array in-place using Durstenfeld shuffle algorithm
function shuffleArrayWithFixedIndex(array, fixedIndex) {
    for (let i = array.length - 1; i > 0; i--) {
        if (i == fixedIndex-1) continue;

        let j;
        do {
            j = Math.floor(Math.random() * (i + 1));
        } while (j == fixedIndex-1); // Ensure j is not the fixed index

        // Swap elements
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Initialization sequence for creating and placing pool balls
function init_pool_balls(){
    const ballPositions = generatePoolBallPositions(poolBallDiameter/2);
    //Create Pool Balls
    for (var i = 0; i <= 15; i++){
        gen_pool_ball(i);
    }
    shuffleArrayWithFixedIndex(ballPositions,5);
    
    let idx = 0;
    for (var element of scene.children){
        if (element.name.includes("ball")){
            pool_balls[0].push(element);
            if (element.name.includes("cue")) gen_phys_pool_ball(element.name, cueBallDefaultPosition);
            else {gen_phys_pool_ball(element.name, ballPositions[idx]);
            idx++;}
        }
    }
    for (var element of world.bodies){
        if (element.name.includes("ball")) pool_balls[1].push(element);
    }
    //swap 8 ball into correct position
    let tempPosition = structuredClone(pool_balls[1][8].position);
    pool_balls[1][8].position.copy(pool_balls[1][5].position);
    pool_balls[1][5].position.copy(tempPosition);
    console.log("Pool Ball Array: ", pool_balls);
}

init_pool_balls();
const cueBall = pool_balls[1][0]; // Global name for the cue ball

// Cue Ball Pointer============================================================
const material = new THREE.LineBasicMaterial({color: 0x0000ff});

const points = [new THREE.Vector3(0,0,-0.1), new THREE.Vector3(0,0,0)];
const geometry = new THREE.BufferGeometry().setFromPoints(points);

const cuePointer = new THREE.Line(geometry, material);
cuePointer.rotateY(Math.PI*1/2);
scene.add(cuePointer);

// Pool Table==================================================================
// Create Pool Table
function createTrimesh(geometry) {
    //const nonIndexed = geometry.toNonIndexed();
    const vertices = geometry.attributes.position.array;
  
    const positions = [];
    const indices = [];
  
    for (let i = 0; i < vertices.length; i += 3) {
      positions.push(vertices[i], vertices[i + 1], vertices[i + 2]);
      indices.push(i / 3);
    }
  
    return new CANNON.Trimesh(positions, indices);
}

objectLoader.load('assets/pool_table/Pool Table.obj', (object) => {
    // Create standard material with texture
    const material = new THREE.MeshStandardMaterial({
        map: textureLoader.load('assets/pool_table/brushed_metal.jpg'),
        roughness: 0.4,
        metalness: 0.1,
    });
    object.children[0].material = material;
    addShadow(object.children[0], true, false);
    object.name = "TableOutside";
    scene.add(object);

    // Create Physics Body from Three Mesh
    const mesh = object.children[0];
    const geometry = mesh.geometry;
    const shape = createTrimesh(geometry);
    
    // Create physics body
    const body = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: shape,
        position: new CANNON.Vec3(0,-0.005,0),
        material: bumperMaterial
    });
    body.name = "TableOutside";
    world.addBody(body); //See about making the mesh simpler for better performance
});

// Three tabletop mesh
const tableGeo = new THREE.BoxGeometry(tableWidth,0.005*2,tableLength,10,10,10);
const tableMat = new THREE.MeshStandardMaterial({color: 0x00ffff, map: textureLoader.load("assets/pool_table/table_felt.jpg")});
const tableModel = new THREE.Mesh(tableGeo, tableMat);
addShadow(tableModel, true, true);
tableModel.name = "TableTop";
scene.add(tableModel);

//Add table head string
const scratchGeo = new THREE.BoxGeometry(tableWidth, 0.001, 0.01);
const tableLineModel = new THREE.Mesh(scratchGeo, new THREE.MeshStandardMaterial({color: 0xffffff, roughness:0.8}));
tableLineModel.position.y += tableGeo.parameters.height/2;
tableLineModel.position.z += tableGeo.parameters.depth/4;
addShadow(tableLineModel, false, true);
tableLineModel.name = "HeadString";
tableModel.add(tableLineModel)

//Add Table Foot Spot
const spotGeo = new THREE.CylinderGeometry(poolBallDiameter/3, poolBallDiameter/3, 0.001);
const spotModel = new THREE.Mesh(spotGeo, new THREE.MeshStandardMaterial({color: 0xffffff, roughness:0.8, map: textureLoader.load("assets/pool_table/spot_marker.jpg")}));//
spotModel.position.y += tableGeo.parameters.height/2;
spotModel.position.z -= tableGeo.parameters.depth/4;
addShadow(spotModel, false, true);
spotModel.name = "FootSpot";
tableModel.add(spotModel)

const tableTop = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Box(new CANNON.Vec3(tableWidth/2,0.005,tableLength/2)),
    position: new CANNON.Vec3(0.5588,-0.005,0),
    quaternion: new CANNON.Quaternion(0,0,0,0),
    material: groundMaterial
});
tableTop.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),Math.PI*1/2);
tableTop.name = "TableTop";
world.addBody(tableTop);
sync_model(tableModel, tableTop)

// Pool Table Holes ===========================================================
const holeGeo = new THREE.CylinderGeometry(poolBallDiameter*1.9,poolBallDiameter*1.9,0,10);
let portaltexture = textureLoader.load("assets/portal.png");
const holeMat = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    emissive: portalColor,
    emissiveIntensity: 1,
    emissiveMap: portaltexture,
    map: portaltexture
})

var holeX = -0.57;
var holeZ = -0.6;
const holeShape = new CANNON.Cylinder(poolBallDiameter*2, poolBallDiameter*2, 0, 10);
for (var i=0; i<6;i++){
    //Three Mesh
    const holePortal = new THREE.Mesh(holeGeo, holeMat);
    holePortal.name = "Hole"+(i+1);
    holePortal.add(portalLight.clone());
    scene.add(holePortal)
    //Cannon body
    const holeBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: holeShape,
        isTrigger: true
    });
    holeBody.position.set(holeX, -0.09, holeZ);
    holeBody.name = "Hole"+(i+1);
    world.addBody(holeBody);
    if (i == 5) break;
    if (i == 2) holeZ = 0.6;
    if (i < 2) holeX += 0.57*2;
    else if (i > 2) holeX -= 0.57*2;
}

// Hole Collision Detection ===================================================
let idx = 1;
for (let element of world.bodies){
    // Add a portal mesh to each hole
    if (element.name == ("Hole"+idx)) {
        sync_model(scene.getObjectByName("Hole"+idx), element);
        idx +=1;
    }

    // Add a collision event for each hole
    if (element.name.includes("Hole")){
        element.addEventListener('collide', (event) => {
            console.log(performance.now())
            const {body} = event;
            const ballName = body.name;
            console.log(`Collision detected between hole: ${element.name} and body id: ${body.name}`);
            
            // Prevent multiple collisions
            const now = Date.now();
            if (teleportCooldowns[ballName] && now - teleportCooldowns[ballName] < 200) {
                return; // if recently teleported, skip detection
            }
            teleportCooldowns[ballName] = now;

            // Game logic
            if (playerCount === 1) {
                handleSinglePlayerSinking(body, ballName);
            } else if (playerCount === 2) {
                handleTwoPlayerSinking(body, ballName);
            }
        });
    };
};

// Ball Container =============================================================
gltfLoader.load('assets/water_dispenser/scene.gltf', (gltf) => {
    gltf.scene.scale.set(0.03,0.03,0.03);
    const waterCooler = gltf.scene;
    waterCooler.position.set(0,0,0);
    waterCooler.name = "waterCooler";
    waterCooler.children[0].children[0].remove(waterCooler.getObjectByName("Object_3"));
    waterCooler.offset = new THREE.Vector3(-0.11,-0.4,0.25);
    waterCooler.position.add(waterCooler.offset)
    addShadow(waterCooler.getObjectByName("Object_2"), true, true)
    initBallContainer(waterCooler);
});

function initBallContainer(waterCooler){
    var containerGroup = new THREE.Group();
    const glassGeo = new THREE.CylinderGeometry(poolBallDiameter*4.5/2,poolBallDiameter*4.5/2,poolBallDiameter*10,10,16);
    containerGroup.name = "BallJail";

    const holePortal = new THREE.Mesh(holeGeo, holeMat);
    holePortal.position.add(new THREE.Vector3(0,poolBallDiameter*2,0));
    holePortal.scale.multiply(new THREE.Vector3(1.25,1,1.25));
    holePortal.add(portalLight.clone());
    holePortal.name = "jailportal";
    containerGroup.add(holePortal);
    containerGroup.add(waterCooler);
    scene.add(containerGroup);
    
    const jailBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        position: new CANNON.Vec3(-1.25, 0.4, -1.25),
        quaternion: new CANNON.Quaternion().setFromEuler(0, Math.PI*1/3, 0),
        material: groundMaterial
    })
    const jailBottom = new CANNON.Cylinder(glassGeo.parameters.radiusTop, glassGeo.parameters.radiusBottom, 0.01, glassGeo.parameters.radialSegments);
    jailBody.addShape(jailBottom, new CANNON.Vec3(0, -glassGeo.parameters.height / 2, 0));

    const wallQuaternion = new CANNON.Quaternion();
    const theta = Math.PI / 5; // angle between two triangle sides (360° / 10 = 36°, in radians)
    const baseLength = glassGeo.parameters.radiusTop * Math.sqrt(2 * (1 - Math.cos(theta)));

    for (let i = 0; i < glassGeo.parameters.radialSegments; i++){
        const angle = i * theta + Math.PI*1/10; // rotation around Y axis
        const wallX = Math.sin(angle) * glassGeo.parameters.radiusTop;
        const wallZ = Math.cos(angle) * glassGeo.parameters.radiusTop;

        // Reset quaternion for each rotation
        wallQuaternion.setFromEuler(0, Math.PI*1/2 + angle, 0);
        jailBody.addShape(new CANNON.Box(new CANNON.Vec3(0.01/2, glassGeo.parameters.height/2, baseLength/2)), new CANNON.Vec3(wallX, 0, wallZ), wallQuaternion);
    }
    jailBody.name = "BallJail";
    world.addBody(jailBody);
    sync_model(containerGroup, jailBody)
}

// Floor ======================================================================
function createTiles(radius, gap, material, width, height, groupName){
    const hexShape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        if (i === 0) {
            hexShape.moveTo(x, y);
        } else {
            hexShape.lineTo(x, y);
        }
    }
    const floorGeo = new THREE.ExtrudeGeometry(hexShape, extrudeSettings);

    const tileGroup = new THREE.Group();
    const xSpacing = radius * 1.5;
    const zSpacing = Math.sqrt(3) * radius;

    for (let q = -width/2; q <= width/2; q++) {
        let r=0;
        q % 2 !== 0 ? r = -height/2 : r = -height/2 + 1
        for (r; r <= height/2; r++) {
            const x = (xSpacing+gap) * q;
            const z = (zSpacing+gap) * r + (q % 2 !== 0 ? (zSpacing+gap) / 2 : 0); // axial coordinate offset
        
            const tile = new THREE.Mesh(floorGeo, material);
            tile.rotation.x = Math.PI / 2;
            tile.position.set(x, 0, z);
            addShadow(tile, false, true);
            tileGroup.add(tile);
        }
    }
    tileGroup.name = groupName;
    return tileGroup;
}

const extrudeSettings = {steps: 1, depth: 0.01, bevelEnabled: true, bevelThickness: 0.0, bevelSize: 0, bevelOffset: 0, bevelSegments: 1};

const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.3,
    roughness: 0.7,
    map: textureLoader.load("assets/slate.jpg", (texture) =>{
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
    }),
});
const lightMat = new THREE.MeshStandardMaterial({
    emissive: new THREE.Color(0x00ffff), // cyan glow
    emissiveIntensity: 1.5,
    color: 0x111111,
});

const radius = 0.3;
const floorWidth = 12, floorHeight = 8;
const basicTiles = createTiles(radius, radius/10 , floorMat, floorWidth, floorHeight, "FloorTiles");
const glowTiles = createTiles(radius*1.05, radius/10 , lightMat, floorWidth, floorHeight,"FloorGlowTiles");
for (var i = 0; i < basicTiles.children.length; i++) {
    let pos = basicTiles.children[i].position;
    glowTiles.children[i].position.set(pos.x, pos.y, pos.z);
}

basicTiles.position.sub(new THREE.Vector3(-0.5588,1,radius));
glowTiles.position.sub(new THREE.Vector3(-0.5588,1+0.01,radius));
scene.add(basicTiles);
scene.add(glowTiles);


// Mini Sun Overhead Light Model===============================================
const sunGeo = new THREE.SphereGeometry(0.2);
const sunMap = textureLoader.load("assets/sun.jpg");
const sunMat = new THREE.MeshStandardMaterial({
    color: 0xFCB000,
    map: sunMap,
    emissiveIntensity: 1,
    emissive: 0xffffff,
    emissiveMap: sunMap
})
const overheadSun = new THREE.Mesh(sunGeo, sunMat);
overheadSun.name = "Sun"
overheadSun.position.set(0.5588,1,0);
overheadSun.add(miniSunLight);
scene.add(overheadSun);

// Game Logic==================================================================
//Single player globals
let singlePlayerStartTime = null;
let singlePlayerEndTime = null;
let sunkBalls = [];
let currentBallIndex = 1; // For 1-player time attack (starts with ball #1)
let jailPosition = null;

//Two player globals
let currentPlayer = 1;
let playerGroups = { 1: null, 2: null }; // "solids" or "stripes"
let playerScores = { 1: [], 2: [] }; // track sunk balls

let gameState = "break"; // break | assigned | 8-ball | over
let ballGroupAssigned = false;
let allStationary = true;
let awaitingNextTurn = false;
let didSinkBall = false;
let playerCalledPocket = null;
let isGameStart = false;
let isGameOver = false;
// ============================================================================
// Start Game function
function startGame(players) {
    //console.log(performance.now())
    if (!isGameStart){
        placeCue(cueBall);
        isGameStart = true;
        playerCount = players;
        isGameOver = false;
        currentPlayer = 1;
        playerScores = {1:[], 2:[]};
        sunkBalls = [];
        currentBallIndex = 1;
        jailPosition = scene.getObjectByName("BallJail").position;
        jailPosition.x += (Math.random()-0.5)*0.06;
        jailPosition.z += (Math.random()-0.5)*0.06;
    
        document.getElementById("game-info").innerText = playerCount === 1 
            ? `1 Player Mode : Sink balls in order 1 through 15 as fast as you can!\nUse arrow keys to move the cue ball to desired location.\nPress 'Enter' to place. Next ball: ${currentBallIndex} ball.`
            : `2 Player Mode : Take turns sinking balls. Player with most wins!`;

        if (playerCount === 1) {
            singlePlayerStartTime = performance.now();
        }
        else if (playerCount === 2) {
            let msg = `Player ${currentPlayer}'s Turn.`;
            console.log(msg)
            document.getElementById("next-player").innerText = msg;
        }
    }
}

// Reset game function
function resetGame() {
    location.reload(); // Reset by reloading the webpage
}

let power = 0;
let powerDirection = 1; // 1 = increasing, -1 = decreasing
let powerCharging = false;
let powerKeyHeld = false;
let powerBarFill = document.getElementById("power-bar-fill");
const powerMin = 0.1;
const powerMax = 1.5;

// Power bar
function powerBar() {
    if (!allStationary) return;
    if (powerCharging) {
        power += powerDirection * 0.02;
    
        if (power >= powerMax) {
            power = powerMax;
            powerDirection = -1;
        }
        if (power <= powerMin) {
            power = powerMin;
            powerDirection = 1;
        }
    
        let percentage = ((power - powerMin) / (powerMax - powerMin)) * 100;
        powerBarFill.style.width = `${percentage}%`;
    }
}

// cue_hit function : Hit cue ball with specified power
function cue_hit(power) {
    if (!allStationary || isGameOver || isPlacingCueBall) return;

    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyEuler(cuePointer.rotation);
    direction.normalize().multiplyScalar(power);

    const impulse = new CANNON.Vec3(direction.x, 0, direction.z);
    cueBall.applyImpulse(impulse);
    awaitingNextTurn = true;
    didSinkBall = false;
}

// Cue Ball placing sequence for break or scratch
let isPlacingCueBall = false;
let moveSpeed = 0.01;
let moveDirection = {ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false};

const placeableBox = new THREE.Line(new THREE.BoxGeometry(tableLength/4*0.98, 0, tableWidth*0.98), new THREE.MeshBasicMaterial()); // might need to offset width by poolBallDiameter
placeableBox.position.x = tableLength-tableLength/4 - 0.5588/2;
placeableBox.position.y = 0.001;
placeableBox.geometry.computeBoundingBox();
const bbox = placeableBox.geometry.boundingBox;
const bounds = {x_min: bbox.min.x+placeableBox.position.x, x_max: bbox.max.x+placeableBox.position.x-poolBallDiameter/2, z_min: bbox.min.z+poolBallDiameter/2, z_max: bbox.max.z-poolBallDiameter/2};

// Cue ball movement function
function moveCueBall(){
    if (!isPlacingCueBall) return;

    const newPos = cueBall.position.clone();

    if (moveDirection.ArrowLeft) newPos.x -= moveSpeed;
    if (moveDirection.ArrowRight) newPos.x += moveSpeed;
    if (moveDirection.ArrowUp) newPos.z -= moveSpeed;
    if (moveDirection.ArrowDown) newPos.z += moveSpeed;

    // Clamp within bounds
    newPos.x = THREE.MathUtils.clamp(newPos.x, bounds.x_min, bounds.x_max);
    newPos.z = THREE.MathUtils.clamp(newPos.z, bounds.z_min, bounds.z_max);

    cueBall.position.copy(newPos);
    cueBall.velocity.set(0, 0, 0);
    cueBall.angularVelocity.set(0, 0, 0);
}

function placeCue(body){
    isPlacingCueBall = true;
    orthoCam = !orthoCam;
    scene.getObjectByName("Sun").material.visible = !scene.getObjectByName("Sun").material.visible;
    ballTeleport(body, true, cueBallDefaultPosition)
    cueBall.sleep();
    scene.add(placeableBox)
}

// Cue Ball place confirmation button
function onClickConfirm() {
    isPlacingCueBall = false;
    orthoCam = !orthoCam;
    scene.getObjectByName("Sun").material.visible = !scene.getObjectByName("Sun").material.visible;
    cueBall.wakeUp();
    scene.remove(placeableBox);
}

// Single player mode logic handling
function handleSinglePlayerSinking(body, ballName) {
    if (ballName === `${currentBallIndex}_ball`) {
        currentBallIndex++;
        ballTeleport(body, true, jailPosition)
        let msg = `Nice job! Next ball: ${currentBallIndex} ball.`
        document.getElementById("game-info").innerText = msg;
        if (currentBallIndex > 15) {
            singlePlayerEndTime = performance.now();
            isGameOver = true;
            const timeTaken = ((singlePlayerEndTime - singlePlayerStartTime) / 1000).toFixed(2);
            let msg = `All balls sunk! Time taken: ${timeTaken} seconds.`;
            document.getElementById("game-info").innerText = msg;
        }
    }
    else if (ballName === `cue_ball`){
        placeCue(body);
        let msg = `Scratch! Cue ball pocketed. Use arrow keys to move the cue ball to desired location and press 'Enter'. Next ball: ${currentBallIndex} ball.`
        document.getElementById("game-info").innerText = msg;
    }
    else {
        ballTeleport(body, false, new THREE.Vector3(Math.random()*0.01,poolBallDiameter*2,Math.random()*0.01))
        let msg = `Ball order improper. Ball reintroduced. Next ball: ${currentBallIndex} ball.`
        document.getElementById("game-info").innerText = msg;
    }
}

// Two player mode logic handling
function handleTwoPlayerSinking(body, ballName) {
    console.log(playerScores)
    const number = parseInt(ballName.split("_")[0]);

    // Scratch
    if (ballName === "cue_ball") {
        placeCue(body);
        awaitingNextTurn = true;
        document.getElementById("game-info").innerText = `Scratch! Cue ball pocketed. Player ${currentPlayer} loses their turn.`;
        return;
    }

    // 8-Ball handling
    if (number === 8) {
        if (gameState !== "8-ball") {
            declareWinner(3 - currentPlayer); // premature 8-ball
        } else if (playerCalledPocket) {
            declareWinner(currentPlayer);
        } else {
            document.getElementById("game-info").innerText = `Player ${currentPlayer} failed to call a pocket! Player ${3 - currentPlayer} wins.`;
            declareWinner(3 - currentPlayer);
        }
        return;
    }

    // Assign groups on first valid sink
    if (!ballGroupAssigned && number !== 0 && number !== 8) {
        if (number <= 7) {
            playerGroups[currentPlayer] = "solids";
            playerGroups[3 - currentPlayer] = "stripes";
        } else {
            playerGroups[currentPlayer] = "stripes";
            playerGroups[3 - currentPlayer] = "solids";
        }
        ballGroupAssigned = true;
        gameState = "assigned";
        document.getElementById("game-info").innerText = `Player ${currentPlayer} is assigned ${playerGroups[currentPlayer]}`;
    }

    // Check ball group validity
    const group = playerGroups[currentPlayer];
    const isPlayerBall = (group === "solids" && number >= 1 && number <= 7) || (group === "stripes" && number >= 9 && number <= 15);

    if (isPlayerBall) {
        didSinkBall = true;
        playerScores[currentPlayer].push(number);
        document.getElementById("game-info").innerText = `Player ${currentPlayer} sunk a ${group} ball!`;

        // Check for 8-ball eligibility
        if (playerScores[currentPlayer].length >= 1) {
            gameState = "8-ball";
            playerCalledPocket = prompt(`Call your pocket for the 8-ball (1-6):\n*Note* Pocket 1 is closest to the water cooler and the next pockets are counted clockwise.`);
            document.getElementById("game-info").innerText = `Player ${currentPlayer} called pocket ${playerCalledPocket} for the 8-ball.`;
            awaitingNextTurn = true
        }

        ballTeleport(body, true, jailPosition);
    } else {
        // Sunk opponent's ball or invalid group
        awaitingNextTurn = true;
        playerScores[3-currentPlayer].push(number);
        document.getElementById("game-info").innerText = `Player ${currentPlayer} sunk an opponent's ball. Turn ends.`;
        ballTeleport(body, false, jailPosition);
    }
}

// Function to handle ball movement/teleportation
function ballTeleport(body, goodSink, position) {
    playSound('assets/audio/teleport.wav', 0.5); //Play Teleport sound effect
    let vel = new THREE.Vector3(0,0,0), angVel = new THREE.Vector3(0,0,0);
    let pos = new THREE.Vector3(position.x, position.y+poolBallDiameter, position.z);
    body.sleep()
    body.inertia.set(vel.x,vel.y,vel.z);
    body.velocity.set(vel.x,vel.y,vel.z);
    body.angularVelocity.set(angVel.x,angVel.y,angVel.z);
    body.position.set(pos.x,pos.y,pos.z);
    body.wakeUp()
    // Error check the ball repositioning
    setTimeout(function() {
        if (-poolBallDiameter*2 < body.position.y < 1) {
            ballTeleport(body, goodSink, position) //Try again
            console.log("Ball Wormhole Error: Retransmitting Ball")}
        else console.log("Ball Wormhole Success")
    }, 1000);
}

function stationaryCheck(){
    allStationary = true
    for (let element of pool_balls[1]){
        if (element.velocity.x > 0.1 || element.angularVelocity.x > 0.1 || element.velocity.z > 0.1 || element.angularVelocity.z > 0.1) allStationary = false;
    }
}

function switchTurns() {
    if (awaitingNextTurn && allStationary && !didSinkBall){
        currentPlayer = 3 - currentPlayer;
        awaitingNextTurn = false;
        document.getElementById("next-player").innerText = `Player ${currentPlayer}'s turn. Target ${playerGroups[currentPlayer]}`;
        if (gameState === "8-ball"){
            gameState = "assigned"
        }
        else if (playerScores[currentPlayer].length >= 1){
            gameState = "8-ball"
            playerCalledPocket = prompt("Which pocket are you calling for the 8-ball?");
            document.getElementById("game-info").innerText = `Pocket ${playerCalledPocket} called.`;
        }
    }
    console.log(gameState)
}

function declareWinner(playerNum) {
    document.getElementById("next-player").innerText = ``;
    document.getElementById("game-info").innerText = `🎉 Player ${playerNum} wins the game!`;
    gameState = "over";
    isGameOver = true;
}


// ============================================================================
var keys = {};
// Event Listeners for Key Presses
window.addEventListener('keydown', (event) => {
    if (isGameStart){
        keys[event.code] = true
        if (event.code === "KeyV") {
            orthoCam = !orthoCam;
            scene.getObjectByName("Sun").material.visible = !scene.getObjectByName("Sun").material.visible;
        }
        if (keys["Enter"] && isPlacingCueBall) onClickConfirm();
        if (event.code in moveDirection) moveDirection[event.code] = true;
        if (event.code === "Space" && !powerKeyHeld){
            powerKeyHeld = true;
            powerCharging = true;
            power = powerMin;
            powerDirection = 1;
        }
    }
});

window.addEventListener('keyup', (event) => {
    if (isGameStart){
        keys[event.code] = false;
        if (event.code in moveDirection) moveDirection[event.code] = false;
        if (event.code === "Space" && powerCharging) {
            cue_hit(power); // shoot with current power
            powerCharging = false;
            powerKeyHeld = false;
            power = 0;
            powerBarFill.style.width = "0%";
        }
    }
});

// Camera Movement Logic
function keyboardInput() {
    if (keys["KeyA"]) cuePointer.rotateY(0.05);  // aim left
    if (keys["KeyD"]) cuePointer.rotateY(-0.05);  // aim right
    if (keys["KeyQ"]) cuePointer.rotateY(0.01);  // slow aim left
    if (keys["KeyE"]) cuePointer.rotateY(-0.01);  // slow aim right

}

// ============================================================================
// Animation Loop==============================================================
function animate() {
    world.fixedStep(1 / 60);
    renderer.render(scene, orthoCam ? cameraOrth : camera);
    if(!orthoCam) controls.update();
    stats.update();
    if (isGameStart){
        keyboardInput();
        stationaryCheck();
        moveCueBall();
        powerBar();
        switchTurns();
    }

    for (var i = 0; i <= pool_balls[0].length-1; i++){
        sync_model(pool_balls[0][i],pool_balls[1][i]);
    }

    //Keep impulse pointer aligned with cue ball
    cuePointer.position.copy(cueBall.position);
    //Rotate sun model
    overheadSun.rotateY(-0.003)
    //Rotate portals
    for (let i = 1; i <= 6; i++) scene.getObjectByName("Hole"+i).rotateY(0.05);
    scene.getObjectByName("jailportal").rotateY(0.05);

    requestAnimationFrame(animate);
}

console.log(scene);
console.log(world);
controls.target = pool_balls[0][0].position;
setTimeout(function() {animate();}, 500);

window.startGame = startGame;
window.resetGame = resetGame;