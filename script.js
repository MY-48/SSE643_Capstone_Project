// SSE 643: Capstone Project
// Interdimensional Pool: Classic pool with a couple twists such as pool guns, powerups, and ball portals once the balls are pocketed.
// Michael Young

import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { OBJLoader, ThreeMFLoader } from 'three/examples/jsm/Addons.js'
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
const cameraOrth = new THREE.OrthographicCamera(viewSize * aspect / - 2, viewSize * aspect / 2, viewSize / 2, viewSize / - 2, 0.1, 200);
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.shadowMap.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

// Debugging Helpers ==========================================================

const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

const cannonDebugger = new CannonDebugger(scene, world, {color: 0x00ff00, scale: 1.0});

const stats = new Stats();
document.body.appendChild(stats.dom);

// Loaders ====================================================================
const textureLoader = new THREE.TextureLoader();
const objectLoader = new OBJLoader();

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
//=============================================================================
//=============================================================================

// Function to get image maps
function getTexture(index) {
    var file_path = "assets/pool_balls/texture_"+index+".png";
    const texture = textureLoader.load(file_path);  // Make sure the path is correct
    return texture;
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
    const nonIndexed = geometry.toNonIndexed();
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
//objectLoader.load('assets/pool_table/Pool Table Reduced Poly.obj', (object) => { //Lower Poly Option
    scene.add(object);
    //console.log(object);
    // Load texture
    const texture = textureLoader.load(
        'assets/table_felt.jpg',
        () => //console.log('Texture loaded'),
        undefined,
        (err) => console.error('Texture load error:', err)
    );

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1); // You can tweak this if it looks stretched

    // Create standard material with texture
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.4,
        metalness: 0.1,
    });

    // Traverse and override material only on visible meshes with UVs
    object.traverse((child) => {
        if (child.isMesh) {
            if (child.geometry.attributes.uv) {
                child.material = material;
            } else {
                console.warn(`Mesh "${child.name}" has no UVs`);
            }

            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    //const texture = textureLoader.load("assets/wood_texture.jpg");
    //const material = new THREE.MeshStandardMaterial({color: 0x964B00, map: textureLoader.load("assets/wood_texture.jpg") });
//
    //object.traverse((child) => {
    //    if (child.isMesh) {
    //        child.material = material; // Apply new material to all meshes
    //        child.castShadow = true;
    //        child.receiveShadow = true;
    //    }
    //});

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
const tableMat = new THREE.MeshStandardMaterial({color: 0x00ff00, map: textureLoader.load("assets/table_felt.jpg")});
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
const holeMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: textureLoader.load("assets/portal.png"),
})

var holeX = -0.57;
var holeZ = -0.6;
for (var i=0; i<6;i++){
    //console.log(holeX+ " : "+ holeZ);
    const holeShape = new CANNON.Cylinder(poolBallDiameter*2,poolBallDiameter*2,0,10);//bumperPosRot[i][0]),
    const holeBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: holeShape,
    });
    holeBody.position.set(holeX,-0.09,holeZ);
    holeBody.name = "Hole"+(i+1);
    world.addBody(holeBody);
    const holePortal = new THREE.Mesh(holeGeo, holeMat);
    holePortal.name = "Hole"+(i+1);
    scene.add(holePortal)
    if (i == 5) break;
    if (i == 2) holeZ = 0.6;
    if (i < 2) holeX += 0.57*2;
    else if (i > 2) holeX -= 0.57*2;
}

function playSound(path, volume){
    var sound = new Howl({
        src: [path],
        volume: volume
    })
    sound.play()
}

// Hole Collision Detection
let idx = 1;
for (let element of world.bodies){
    if (element.name.includes("Hole")){
        element.addEventListener('collide', (event) => {
            const { body, contact } = event;
            console.log(`Collision detected between hole: ${element.name} and body id: ${body.name}`);
            console.log('Contact point:', contact.contactPointA);
            console.log('Contact normal:', contact.ni);
            
            //Teleport to ball jail
            playSound('assets/audio/teleport.wav', 0.5); //Modify sound with Audacity to shorten
            body.position.set(0,poolBallDiameter,0);
            body.velocity.set(0,0,0);
            body.angularVelocity.set(0, 0, 0);
            body.inertia.set(0,0,0);
        });
    };

    // Add a portal mesh to each hole
    if (element.name == ("Hole"+idx)) {
        sync_model(scene.getObjectByName("Hole"+idx), element);
        //console.log(scene.getObjectByName("Hole"+idx));
        idx +=1;
    }
};

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

// Set camera & Lighting=======================================================
camera.position.set(0,2,1);

cameraOrth.position.set(0,2,0);
cameraOrth.position.x += 0.5588;
cameraOrth.lookAt(0.5588,0,0);

scene.background = new THREE.Color(0x444444);

const light = new THREE.AmbientLight(0xaaaaaa, 1);
light.name = "AmbientLight";
scene.add(light);

const miniSunLight = new THREE.PointLight(0xffffff, 3);
miniSunLight.position.set(0.5588,1,0);
miniSunLight.name = "DirectionalLight";
miniSunLight.add(overheadSun);
scene.add(miniSunLight);
console.log(miniSunLight)

//Shadow properties for the "sun"
miniSunLight.castShadow = true;
miniSunLight.shadow.mapSize.width = 4096; // default
miniSunLight.shadow.mapSize.height = 4096; // default
miniSunLight.shadow.camera.near = 0.5; // default
miniSunLight.shadow.camera.far = 500; // default

// Timeout Functions===========================================================

//setTimeout(function() {
    //pool_balls[1][0].position.set(-0.57,0,-0.6);
//}, 1000);

// Game Logic==================================================================
const material = new THREE.LineBasicMaterial({color: 0x0000ff});

const points = [];
points.push(new THREE.Vector3(0,0,0));//-0.1
points.push(new THREE.Vector3(0,0,0.1));

const geometry = new THREE.BufferGeometry().setFromPoints(points);

const cuePointer = new THREE.Line(geometry, material);
cuePointer.rotateY(Math.PI*1/2);
scene.add(cuePointer);

// Hit cue ball with specified power
function cue_hit(power) {
    // Create a direction vector pointing forward in local space (negative Z is "forward" in Three.js)
    const direction = new THREE.Vector3(0, 0, -1); 
    
    // Convert this direction into world space using cuePointerHolder's orientation
    direction.applyEuler(cuePointer.rotation); 
    
    // Optionally normalize and scale it to get the desired impulse strength
    direction.normalize().multiplyScalar(power); // Adjust the scalar for power

    // Apply impulse in Cannon.js (convert THREE.Vector3 to CANNON.Vec3)
    const impulse = new CANNON.Vec3(direction.x, 0, direction.z);
    cueBall.applyImpulse(impulse);
}

// Cue Ball placing sequence for break or scratch
function placeCueBall(){

}

// ============================================================================
var keys = {};
// Event Listeners for Key Presses
window.addEventListener('keydown', (event) => {
    keys[event.code] = true
    if (event.code === "KeyV") {
        orthoCam = !orthoCam
        miniSunLight.traverse((child) => {if (child.isMesh) child.visible = !child.visible})
    }
});
window.addEventListener('keyup', (event) => keys[event.code] = false);

// Camera Movement Logic
function updateCameraMovement() {
    if (keys["KeyA"]) cuePointer.rotateY(0.05);  // aim left
    if (keys["KeyD"]) cuePointer.rotateY(-0.05);  // aim right
    if (keys["Space"]) cue_hit(0.1);//cueBall.applyImpulse(force, cueBall.position);
}

// ============================================================================
// Animation Loop==============================================================
function animate() {
    world.fixedStep(1 / 60);
    renderer.render(scene, orthoCam ? cameraOrth : camera);
    controls.update();
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
    miniSunLight.rotateY(0.003)
    //Rotate portals
    for (let i = 1; i <7; i++) scene.getObjectByName("Hole"+i).rotateY(0.05);
}

console.log(scene);
console.log(world);
animate();
