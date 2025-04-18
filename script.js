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
import { element, step, texture } from 'three/tsl'

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
//document.body.appendChild(stats.dom);

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
var gameType = "8-ball";
var playerCount = 1; //single player default


// Constants
const poolBallMass = 0.170; //170 grams or 6oz
const poolBallDiameter = 0.057; //57mm or 2 1/4 inch
const tableLength = 2.24; //224cm or 88inch
const tableWidth = tableLength/2; //112cm or 44inch

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

const powerRange = [];


let currentPlayer = 1;
let playerScores = [0, 0];
let singlePlayerStartTime = null;
let singlePlayerEndTime = null;
let sunkBalls = [];
let currentBallIndex = 1; // For 1-player time attack (starts with ball #1)
let isGameOver = false;
let awaitingNextTurn = false;

//=============================================================================
//=============================================================================

// Set camera & Lighting=======================================================
camera.position.set(0,2,1);

cameraOrth.position.set(0,2,0);
cameraOrth.position.x += 0.5588;
cameraOrth.lookAt(0.5588,0,0);

scene.background = new THREE.Color(0x444444);
genSky();

const light = new THREE.AmbientLight(0xaaaaaa, 1);
light.name = "AmbientLight";
scene.add(light);

const miniSunLight = new THREE.PointLight(0xffffff, 3);
miniSunLight.name = "DirectionalLight";

const portalColor = new THREE.Color(0x00ffff);
const portalLight = new THREE.PointLight(portalColor, 1, 1, 0.5);


//Shadow properties for the "sun"
miniSunLight.castShadow = true;
miniSunLight.shadow.mapSize.width = 4096; // default
miniSunLight.shadow.mapSize.height = 4096; // default
miniSunLight.shadow.camera.near = 0.5; // default
miniSunLight.shadow.camera.far = 500; // default

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
    var pos = new CANNON.Vec3(rack_pos[0],rack_pos[1],rack_pos[2]);//(Math.random()*0.1, Math.random()*0, Math.random()*0.1);
    if (ball == "cue_ball") pos.set(0.8, poolBallDiameter/2, 0);
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
            positions.push([posX, radius, posZ]);
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
    //console.log("8-Ball Positions:", ballPositions);
    
    //Create Pool Balls
    if (gameType === "8-ball") { 
        for (var i = 0; i <= 15; i++){
            gen_pool_ball(i);
        }
        shuffleArrayWithFixedIndex(ballPositions,5);

    }
    else if (gameTypse === "9-ball") {
        for (var i = 0; i <= 9; i++){
            gen_pool_ball(i);
        }
    }
    
    let idx = 0;
    for (var element of scene.children){
        if (element.name.includes("ball")){
            pool_balls[0].push(element);
            if (element.name.includes("cue")) gen_phys_pool_ball(element.name, [0,0,0]);
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
    console.log(pool_balls);
}

init_pool_balls();
const cueBall = pool_balls[1][0]; // Global name for the cue ball

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
    scene.add(object);
    console.log(object);
    // Load texture
    const texture = textureLoader.load('assets/pool_table/brushed_metal.jpg');
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1); // You can tweak this if it looks stretched

    // Create standard material with texture
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.4,
        metalness: 0.1,
    });
    object.children[0].material = material

    const mesh = object.children[0];
    const geometry = mesh.geometry;

    // Convert to Cannon-ES shape
    const shape = createTrimesh(geometry);
    
    // Create Cannon-ES body
    const body = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: shape,
        position: new CANNON.Vec3(0,-0.005,0),
        material: bumperMaterial      
    });
    body.name = "Table";
    world.addBody(body); //See about making the mesh simpler for better performance
});


const tableGeo = new THREE.BoxGeometry(tableWidth,0.005*2,tableLength,10,10,10);
const tableMat = new THREE.MeshStandardMaterial({color: 0x00ffff, map: textureLoader.load("assets/pool_table/table_felt.jpg")});
const tableModel = new THREE.Mesh(tableGeo, tableMat);
tableModel.castShadow = false;
tableModel.receiveShadow = true;
tableModel.name = "TableTop";
scene.add(tableModel);

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
for (var i=0; i<6;i++){
    //console.log(holeX+ " : "+ holeZ);
    const holeShape = new CANNON.Cylinder(poolBallDiameter*2,poolBallDiameter*2,0,10);//bumperPosRot[i][0]),
    const holeBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: holeShape,
        isTrigger: true
    });
    holeBody.position.set(holeX,-0.09,holeZ);
    holeBody.name = "Hole"+(i+1);
    world.addBody(holeBody);
    const holePortal = new THREE.Mesh(holeGeo, holeMat);
    holePortal.name = "Hole"+(i+1);
    holePortal.add(portalLight.clone());
    scene.add(holePortal)
    if (i == 5) break;
    if (i == 2) holeZ = 0.6;
    if (i < 2) holeX += 0.57*2;
    else if (i > 2) holeX -= 0.57*2;
}

// Hole Collision Detection ===================================================
let idx = 1;
for (let element of world.bodies){
    if (element.name.includes("Hole")){
        element.addEventListener('collide', (event) => {
            const {body} = event;
            console.log(`Collision detected between hole: ${element.name} and body id: ${body.name}`);
            const ballName = body.name;

            if (!ballName.includes("ball")) return;

            // Prevent multiple detections
            if (sunkBalls.includes(ballName)) return;
            sunkBalls.push(ballName);

            //Teleport to ball jail
            playSound('assets/audio/teleport.wav', 0.5); //Modify sound with Audacity to shorten
            ball_teleport(body, true, scene.getObjectByName("balljail").position)

            // Game logic
            if (playerCount === 1) {
                handleSinglePlayerSinking(body, ballName);
            } else if (playerCount === 2) {
                handleTwoPlayerSinking(body, ballName);
            }

        });
    };

    // Add a portal mesh to each hole
    if (element.name == ("Hole"+idx)) {
        sync_model(scene.getObjectByName("Hole"+idx), element);
        //console.log(scene.getObjectByName("Hole"+idx));
        idx +=1;
    }
};

// Ball Container =============================================================
function init_ball_container(waterCooler){
    var containerGroup = new THREE.Group();
    const glassGeo = new THREE.CylinderGeometry(poolBallDiameter*4.5/2,poolBallDiameter*4.5/2,poolBallDiameter*10,10,16);
    containerGroup.name = "balljail";

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
    jailBody.name = "balljail";
    world.addBody(jailBody);
    sync_model(containerGroup, jailBody)
}

gltfLoader.load('assets/water_dispenser/scene.gltf', (gltf) => {
    gltf.scene.scale.set(0.03,0.03,0.03);
    const waterCooler = gltf.scene;
    waterCooler.position.set(0,0,0);
    waterCooler.name = "waterCooler";
    console.log(waterCooler)
    waterCooler.children[0].children[0].remove(waterCooler.getObjectByName("Object_3"));
    waterCooler.offset = new THREE.Vector3(-0.11,-0.4,0.25);
    waterCooler.position.add(waterCooler.offset)
    init_ball_container(waterCooler);
});

// Floor ======================================================================
function create_tiles(radius, gap, material, width, height){
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
        
            tileGroup.add(tile);
        }
    }
    return tileGroup
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
const basicTiles = create_tiles(radius, radius/10 , floorMat, floorWidth, floorHeight)
const glowTiles = create_tiles(radius*1.05, radius/10 , lightMat, floorWidth, floorHeight)
for (var i = 0; i < basicTiles.children.length; i++) {
    let pos = basicTiles.children[i].position;
    glowTiles.children[i].position.set(pos.x, pos.y, pos.z);
}

basicTiles.position.sub(new THREE.Vector3(-0.5588,1,radius))
glowTiles.position.sub(new THREE.Vector3(-0.5588,1+0.01,radius))
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

// Timeout Functions===========================================================

//setTimeout(function() {
    //pool_balls[1][0].position.set(-0.57,0,-0.6);
//}, 1000);

// Cue Pointer=================================================================
const material = new THREE.LineBasicMaterial({color: 0x0000ff});

const points = [];
points.push(new THREE.Vector3(0,0,-0.1));//-0.1
points.push(new THREE.Vector3(0,0,0));//0.1

const geometry = new THREE.BufferGeometry().setFromPoints(points);

const cuePointer = new THREE.Line(geometry, material);
cuePointer.rotateY(Math.PI*1/2);
scene.add(cuePointer);
console.log(cuePointer)

// Game Logic==================================================================

document.getElementById("score").innerText = `Player 1: ${playerScores[0]} | Player 2: ${playerScores[1]}`;

function startGame(players) {
    playerCount = players;
    isGameOver = false;
    currentPlayer = 1;
    playerScores = [0, 0];
    sunkBalls = [];
    currentBallIndex = 1;

    document.getElementById("game-info").innerText = playerCount === 1 
        ? "1 Player Mode : Sink balls in order 1 through 15 as fast as you can!" //1 Player Mode : Sink balls in order 1-7 then 9-15 then 8 as fast as you can!
        : "2 Player Mode : Take turns sinking balls. Player with most wins!";

    if (playerCount === 1) {
        singlePlayerStartTime = performance.now();
    }
    else {

    }
}

function resetGame() {
    location.reload(); // Simple and effective for dev!
}

//if (playerCount === 1) {
//    singlePlayerStartTime = performance.now();
//}

// Hit cue ball with specified power
function cue_hit(power) {
    if (awaitingNextTurn || isGameOver) return;

    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyEuler(cuePointer.rotation);
    direction.normalize().multiplyScalar(power);

    const impulse = new CANNON.Vec3(direction.x, 0, direction.z);
    cueBall.applyImpulse(impulse);
}

// Cue Ball placing sequence for break or scratch
function placeCueBall(){
    //tableModel.
    //var placeableArea = 
}

function handleSinglePlayerSinking(body, ballName) {
    if (ballName === `${currentBallIndex}_ball`) {
        currentBallIndex++;
        if (currentBallIndex > 15) {
            singlePlayerEndTime = performance.now();
            isGameOver = true;
            const timeTaken = ((singlePlayerEndTime - singlePlayerStartTime) / 1000).toFixed(2);
            alert(`All balls sunk! Time taken: ${timeTaken} seconds.`);
        }
        ball_teleport(body, true, scene.getObjectByName("balljail").position)
        let msg = `Nice job! Next ball: ${currentBallIndex} ball.`
        console.log(msg)
    }
    else if (ballName === `cue_ball`){
        //placeCueBall()
        ball_teleport(body, false, scene.getObjectByName("balljail").position)
        let msg = `Cue ball pocketed. Place behind the line and try again. Next ball: ${currentBallIndex} ball.`
        console.log(msg)
    }
    else {
        ball_teleport(body, false, scene.getObjectByName("balljail").position)
        let msg = `Ball order improper. Ball reintroduced. Next ball: ${currentBallIndex} ball.`
        console.log(msg)
    }
}

function handleTwoPlayerSinking(body, ballName) {
    playerScores[currentPlayer - 1]++;
    awaitingNextTurn = true;
    setTimeout(() => {
        currentPlayer = 3 - currentPlayer; // Switch between 1 and 2
        awaitingNextTurn = false;
        alert(`Player ${currentPlayer}'s turn!`);
    }, 1000);
    var pick = call_8_pocket()
    document.getElementById("score").innerText = `Player 1: ${playerScores[0]} | Player 2: ${playerScores[1]}`;
}

function ball_teleport(body, goodSink, position) {
    let vel = new THREE.Vector3(0,0,0), angVel = new THREE.Vector3(0,0,0);
    let pos = goodSink ? new THREE.Vector3(position.x+Math.random()*0.05, position.y+poolBallDiameter, position.z+Math.random()*0.05) : new THREE.Vector3(Math.random()*0.01,poolBallDiameter*2,Math.random()*0.01);
    body.velocity.set(vel.x,vel.y,vel.z);
    body.angularVelocity.set(angVel.x,angVel.y,angVel.z);
    body.position.set(pos.x,pos.y,pos.z);
}

function call_8_pocket(){
    let msg = `Choose a pocket: 1-6
                1 2 3
                6 5 4`;
    let pick = 1; //user selection
    return pick
}
// ============================================================================
var keys = {};
// Event Listeners for Key Presses
window.addEventListener('keydown', (event) => {
    keys[event.code] = true
    if (event.code === "KeyV") {
        orthoCam = !orthoCam;
        scene.getObjectByName("Sun").material.visible = !scene.getObjectByName("Sun").material.visible;
        //miniSunLight.traverse((child) => {if (child.isMesh) child.visible = !child.visible})
        //cuePointer.geometry.scale(1,1,10)
        //cuePointer.geometry.scale(1,1,.1)
    }
    if (keys["Space"]) cue_hit(0.5);//cueBall.applyImpulse(force, cueBall.position);
});
window.addEventListener('keyup', (event) => {
    keys[event.code] = false;
});

// Camera Movement Logic
function updateCameraMovement() {
    if (keys["KeyA"]) cuePointer.rotateY(0.05);  // aim left
    if (keys["KeyD"]) cuePointer.rotateY(-0.05);  // aim right
}

// ============================================================================
// Animation Loop==============================================================
function animate() {
    world.fixedStep(1 / 60);
    renderer.render(scene, orthoCam ? cameraOrth : camera);
    if(!orthoCam) controls.update();
    stats.update();
    updateCameraMovement()
    //cannonDebugger.update() // Update the CannonDebugger meshes
    requestAnimationFrame(animate);

    for (var i = 0; i <= pool_balls[0].length-1; i++){
        sync_model(pool_balls[0][i],pool_balls[1][i]);
    }

    //Keep impulse pointer aligned with cue ball
    cuePointer.position.copy(cueBall.position);
    //Rotate sun model
    overheadSun.rotateY(-0.003)
    //Rotate portals
    for (let i = 1; i <7; i++) scene.getObjectByName("Hole"+i).rotateY(0.05);
    scene.getObjectByName("jailportal").rotateY(0.05);
}

console.log(scene);
console.log(world);
controls.target = pool_balls[0][0].position;
setTimeout(function() {animate();}, 1000);

window.startGame = startGame;
window.resetGame = resetGame;