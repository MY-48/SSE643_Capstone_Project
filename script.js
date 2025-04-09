// SSE 643: Capstone Project
// Michael Young

import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import CannonDebugger from 'cannon-es-debugger'


// Create top-level environments
const scene = new THREE.Scene();
const world = new CANNON.World({gravity: new CANNON.Vec3(0,-9.81, 0)});
const cannonDebugger = new CannonDebugger(scene, world, {color: 0x00ff00, scale: 1.1});

// Initailize important things
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

const textureLoader = new THREE.TextureLoader();

//================================================
//Enviromnet Variables
// Constants
const poolBallMass = 0.170; //170 grams or 6oz
const poolBallDiameter = 0.057; //57mm or 2 1/4 inch
var tableLength = 2.24; //224cm or 88inch
var tableWidth = tableLength/2; //112cm or 44inch
//================================================

//Window Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Function to get image maps
function getTexture(index) {
    var file_path = "assets/pool_balls/texture_"+index+".png";
    const texture = textureLoader.load(file_path);  // Make sure the path is correct
    return texture;
}

// Pool Balls=====================================
// Function to create pool ball meshes
function gen_pool_ball(ball){
    const ballGeo = new THREE.SphereGeometry(poolBallDiameter/2,32,32);
    const ballMat = new THREE.MeshStandardMaterial({
        map: getTexture(ball),
        roughness: 0.05
    });
    const ballModel = new THREE.Mesh(ballGeo, ballMat);
    ballModel.name = ball.toString() + "_ball";
    if (ball == 16) ballModel.name = "cue_ball";
    scene.add(ballModel);
}

// Create physics object for pool balls
function gen_phys_pool_ball(ball){
    const ballShape = new CANNON.Sphere(poolBallDiameter/2);
    const ballBody = new CANNON.Body({
        mass: poolBallMass,
        position: new CANNON.Vec3(Math.random()*1, Math.random()*1, Math.random()*1),
        shape: ballShape
    });
    ballBody.name = ball;
    world.addBody(ballBody);
}

// Sync pool ball positions
function sync_balls(model, cannonBody){
    model.position.copy(cannonBody.position);
    model.quaternion.copy(cannonBody.quaternion);
}

function rack_balls(type){
    const ballPositions = [];
    for (var i = 0; i < 5; i++){

        ballPositions.push([new CANNON.Vec3(x,y,z)])
    }
    return ballPositions;
}

//Create Pool Balls
for (var i = 1; i <= 16; i++){
    gen_pool_ball(i);
}

var pool_balls = [[],[]];
for (var element of scene.children){
    if (element.name.includes("ball")) pool_balls[0].push(element);
    gen_phys_pool_ball(element.name);
}
for (var element of world.bodies){
    if (element.name.includes("ball")) pool_balls[1].push(element);
}

console.log(pool_balls);

// Pool Table=====================================
// Create Pool Table
const tableGeo = new THREE.BoxGeometry(tableLength,0.1,tableWidth,10,10,10);
const tableMat = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    map: textureLoader.load("assets/table_felt.jpg")
});
const tableModel = new THREE.Mesh(tableGeo, tableMat);
scene.add(tableModel);

const tableBody = new CANNON.Body({
    mass: 0,
    position: new CANNON.Vec3(0,-0.1,0),
    shape: new CANNON.Box(new CANNON.Vec3(tableLength/2,0.05,tableWidth/2))
});
tableBody.name = "Table";
world.addBody(tableBody);
console.log(world);
//tableBody.quaternion.setFromEuler(0, 0, 0);
tableModel.position.copy(tableBody.position);
tableModel.quaternion.copy(tableBody.quaternion);

// Set camera starting position
camera.position.set(0,1,0);
camera.lookAt(0,0,0);

scene.background = new THREE.Color(0x444444);

const light = new THREE.AmbientLight(0xffffff, 3);
light.name = "AmbientLight";
scene.add(light);

// Animation Loop
function animate() {
    world.fixedStep(1 / 60);
    renderer.render(scene, camera);
    controls.update();
    //cannonDebugger.update() // Update the CannonDebugger meshes
    requestAnimationFrame(animate);

    for (var i = 0; i <= pool_balls[0].length-1; i++){
        sync_balls(pool_balls[0][i],pool_balls[1][i]);
    }
}

animate();