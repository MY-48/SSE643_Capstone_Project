// SSE 643: Capstone Project
// Interdimensional Pool: Classic pool with a couple twists such as pool guns, powerups, and ball portals once the balls are pocketed.
// Michael Young

import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/Addons.js';
import CannonDebugger from 'cannon-es-debugger'
import Stats from 'stats.js'
import {Howl} from 'howler';

// Create top-level environments ==============================================
const scene = new THREE.Scene();

const world = new CANNON.World({gravity: new CANNON.Vec3(0,-9.81, 0)});
world.solver.iterations = 20;

// Initailize important things=================================================
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

// Debugging Helpers ==========================================================
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

const cannonDebugger = new CannonDebugger(scene, world, {color: 0x00ff00, scale: 1.0});

const stats = new Stats();
document.body.appendChild(stats.dom);

// Loaders=====================================================================
const textureLoader = new THREE.TextureLoader();
const objectLoader = new OBJLoader();
const audioLoader = new THREE.AudioLoader();

// Audio Engine================================================================
//const listener = new THREE.AudioListener();
//camera.add(listener);
//function playSound(path, volume){
//    const newSound = new THREE.Audio(listener);
//    audioLoader.load(path), function(buffer){
//        newSound.setBuffer(buffer);
//        newSound.setVolume(volume);    
//    }
//}

//Window Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

//=============================================================================
//Enviromnet Variables
var pool_balls = [[],[]];

// Constants
const poolBallMass = 0.170; //170 grams or 6oz
const poolBallDiameter = 0.057; //57mm or 2 1/4 inch
var tableLength = 2.24; //224cm or 88inch
var tableWidth = tableLength/2; //112cm or 44inch
var gameType = "8-ball"

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

//=============================================================================

// Function to get image maps
function getTexture(index) {
    var file_path = "assets/pool_balls/texture_"+index+".png";
    const texture = textureLoader.load(file_path);  // Make sure the path is correct
    return texture;
}

// Pool Balls==================================================================
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
    world.addBody(ballBody);
}

// Sync pool ball positions
function sync_model(model, cannonBody){
    model.position.copy(cannonBody.position);
    model.quaternion.copy(cannonBody.quaternion);
}

// generatePoolBallPositions FUNCTION
function generatePoolBallPositions(radius) {
    const positions = [];
    let startX = 0; // The frontmost ball position
    let rows = 5;
    for (let row = 0; row < rows; row++) {
        let numBalls = row + 1; // 1, 2, 3, 4, 5
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
        if (i === fixedIndex) continue;

        let j;
        do {
            j = Math.floor(Math.random() * (i + 1));
        } while (j === fixedIndex); // Ensure j is not the fixed index

        // Swap elements
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function init_pool_balls(){
    const ballPositions = generatePoolBallPositions(poolBallDiameter/2);
    //console.log("8-Ball Positions:", ballPositions);
    
    //Create Pool Balls
    if (gameType === "8-ball") { 
        for (var i = 0; i <= 15; i++){
            gen_pool_ball(i);
        }
        shuffleArrayWithFixedIndex(ballPositions,1);
    }
    else if (gameType === "9-ball") {
        for (var i = 0; i <= 9; i++){
            gen_pool_ball(i);
        }
    }
    
    var ind = 0;
    for (var element of scene.children){
        if (element.name.includes("ball")){
            pool_balls[0].push(element);
            if (element.name.includes("cue")) gen_phys_pool_ball(element.name, [0,0,0]);
            else {gen_phys_pool_ball(element.name, ballPositions[ind]);
            ind++;}
        }
    }
    for (var element of world.bodies){
        if (element.name.includes("ball")) pool_balls[1].push(element);
    }
    
    console.log(pool_balls);
}
init_pool_balls();

// Pool Table==================================================================
// Create Pool Table
function createTrimesh(geometry) {
    // Ensure geometry is non-indexed for simplicity
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
//objectLoader.load('assets/pool_table/Pool Table Reduced Poly.obj', (object) => { //Lower Poly Option
    scene.add(object);
    console.log(object);
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

var holeX = -0.57;
var holeZ = -0.6;
for (var i=0; i<6;i++){
    console.log(holeX+ " : "+ holeZ);
    const holeShape = new CANNON.Cylinder(poolBallDiameter*2,poolBallDiameter*2,0,10);//bumperPosRot[i][0]),
    const holeBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: holeShape,
    });
    holeBody.position.set(holeX,-0.1,holeZ);
    holeBody.name = "Hole"+(i+1);
    world.addBody(holeBody);
    if (i == 5) break;
    if (i == 2) holeZ = 0.6;
    if (i < 2) holeX += 0.57*2;
    else if (i > 2) holeX -= 0.57*2;
}

function playSound(path, volume){
    var sound = new Howl({
        src: [path],
        volume: volume,
    })
    sound.play()
}

// Hole Collision Detection
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
};

// Set camera & Lighting=======================================================
camera.position.set(0,1,0);
camera.lookAt(0,0,0);

scene.background = new THREE.Color(0x444444);

const light = new THREE.AmbientLight(0xaaaaaa, 1);
light.name = "AmbientLight";
scene.add(light);

const dirlight = new THREE.DirectionalLight(0xffffff, 3);
dirlight.position.set(1,1,1);
dirlight.name = "DirectionalLight";
scene.add(dirlight);


// Timeout Functions===========================================================

setTimeout(function() {
    //pool_balls[1][0].position.set(-0.57,0,-0.6);
    pool_balls[1][0].applyImpulse(new CANNON.Vec3(-1, 0, (Math.random()-0.5)*.1)); //Add a force to the cue ball
    setInterval(function() {
        pool_balls[1][0].applyImpulse(new CANNON.Vec3(Math.random()-0.5, 0, Math.random()-0.5)); //Add a force to the cue ball
        pool_balls[1][8].applyImpulse(new CANNON.Vec3(Math.random()-0.5, 0, Math.random()-0.5)); //Add a force to the cue ball
        pool_balls[1][15].applyImpulse(new CANNON.Vec3(Math.random()-0.5, 0, Math.random()-0.5)); //Add a force to the cue ball
    }, 2000);    
}, 2000);

// Game Logic==================================================================
const material = new THREE.LineBasicMaterial({
	color: 0x0000ff
});

const points = [];
points.push( new THREE.Vector3( -0.1, 0, 0 ) );
points.push( new THREE.Vector3( 0, 0, 0 ) );

const geometry = new THREE.BufferGeometry().setFromPoints( points );

const cuePointer = new THREE.Line( geometry, material );
scene.add( cuePointer );

function cue_hit(){
    console.log(cuePointer.rotation.y.toString());
    console.log(cuePointer.rotation);
    var x = Math.sin(cuePointer.rotation.y) *0.25;
    var z = Math.cos(cuePointer.rotation.y) *0.25;
    pool_balls[1][0].applyImpulse(new CANNON.Vec3(z,0,x));
}

//const cueBall = pool_balls[1][0]; // CANNON.Body
//const cuePosition = cueBall.position.clone(); // Vec3
//const lineEnd = new CANNON.Vec3(x, y, z); // Target point on table
//
//// 1. Get direction vector (from cue ball *away from line end*)
//const direction = cuePosition.vsub(lineEnd); // pointing "back" from target
//direction.normalize();
//
//// 2. Scale by desired force
//const force = direction.scale(impulseStrength); // e.g., 5 or 10
//
//// 3. Apply impulse to the cue ball
//cueBall.applyImpulse(force, cueBall.position);

// ============================================================================
var keys = {};
// Event Listeners for Key Presses
window.addEventListener('keydown', (event) => keys[event.code] = true);
window.addEventListener('keyup', (event) => keys[event.code] = false);

// Camera Movement Logic
function updateCameraMovement() {
    if (keys["KeyA"]) cuePointer.rotateY(0.1);  // aim left
    if (keys["KeyD"]) cuePointer.rotateY(-0.1);  // aim right
    if (keys["KeyW"]) cueBall.applyImpulse(force, cueBall.position);
}

// ============================================================================
// Animation Loop==============================================================
function animate() {
    world.fixedStep(1 / 60);
    renderer.render(scene, camera);
    controls.update();
    stats.update();
    updateCameraMovement()
    //cannonDebugger.update() // Update the CannonDebugger meshes
    requestAnimationFrame(animate);

    for (var i = 0; i <= pool_balls[0].length-1; i++){
        sync_model(pool_balls[0][i],pool_balls[1][i]);
    }
    cuePointer.position.copy(pool_balls[1][0].position);
    //cuePointer.quaternion.copy(pool_balls[1][0].quaternion);
}
console.log(world);
animate();
