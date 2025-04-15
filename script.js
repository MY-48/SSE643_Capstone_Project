// SSE 643: Capstone Project
// Michael Young

import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/Addons.js';
import CannonDebugger from 'cannon-es-debugger'


// Create top-level environments ==================================================
const scene = new THREE.Scene();
const world = new CANNON.World({gravity: new CANNON.Vec3(0,-9.81, 0)});
const cannonDebugger = new CannonDebugger(scene, world, {color: 0x00ff00, scale: 1.0});

// Initailize important things
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

const textureLoader = new THREE.TextureLoader();

const objectLoader = new OBJLoader();

//Window Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

//=================================================================================
//Enviromnet Variables
var pool_balls = [[],[]];

// Constants
const poolBallMass = 0.170; //170 grams or 6oz
const poolBallDiameter = 0.057; //57mm or 2 1/4 inch
var tableLength = 2.24; //224cm or 88inch
var tableWidth = tableLength/2; //112cm or 44inch
var gameType = "8-ball"

const hardMaterial = new CANNON.Material("hardMaterial");
const groundMaterial = new CANNON.Material('ground');

const ballContactMaterial = new CANNON.ContactMaterial(hardMaterial,hardMaterial,{
    contactEquationRelaxation: 2,
    friction: 0.3,
    restitution: 1
});
const ball_ground = new CANNON.ContactMaterial(groundMaterial, hardMaterial, {
    friction: 100,
    restitution: 0.3,
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 3,
    frictionEquationStiffness: 1e8,
    frictionEquationRegularizationTime: 3,
});

// Add the contact materials to the world
world.addContactMaterial(ballContactMaterial);
world.addContactMaterial(ball_ground);

//=================================================================================

// Function to get image maps
function getTexture(index) {
    var file_path = "assets/pool_balls/texture_"+index+".png";
    const texture = textureLoader.load(file_path);  // Make sure the path is correct
    return texture;
}

// Pool Balls======================================================================
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
    if (ball == "cue_ball") pos.set(0.8, poolBallDiameter, 0);
    const ballShape = new CANNON.Sphere(poolBallDiameter/2);
    const ballBody = new CANNON.Body({
        mass: poolBallMass,
        linearDamping: 0.34,
        angularDamping: 0.34,
        position: pos,
        shape: ballShape,
        material: hardMaterial
    });
    ballBody.name = ball;
    world.addBody(ballBody);
}

// Sync pool ball positions
function sync_balls(model, cannonBody){
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
            positions.push([posZ, 2, -posX]);
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
        shuffleArrayWithFixedIndex(ballPositions,11);
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

// Pool Table======================================================================
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
  

objectLoader.load('assets/pool_table/Body1.obj', (object) => {
    scene.add(object);
    console.log(object);
    const mesh = object.children[0];//element; // assume first child is the mesh
    const geometry = mesh.geometry;

    // Convert to Cannon-ES shape
    const shape = createTrimesh(geometry);
    
    // Create Cannon-ES body
    const body = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: shape,
        //position: new CANNON.Vec3(0,-0.1,0),
        material: groundMaterial      
    });
    tableBody.name = "Table";
    world.addBody(body);
});


const tableGeo = new THREE.BoxGeometry(tableWidth,0.1,tableLength,10,10,10);
const tableMat = new THREE.MeshStandardMaterial({color: 0x00ff00, map: textureLoader.load("assets/table_felt.jpg")});
const tableModel = new THREE.Mesh(tableGeo, tableMat);
scene.add(tableModel);

const tableBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    position: new CANNON.Vec3(0,0.1,0),
    shape: new CANNON.Box(new CANNON.Vec3(tableWidth/2,0.05,tableLength/2)),
    material: groundMaterial
});
tableBody.name = "Table";
world.addBody(tableBody);

tableModel.position.copy(tableBody.position);
tableModel.quaternion.copy(tableBody.quaternion);

// Set camera & Lighting===========================================================
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

// Animation Loop==================================================================
function animate() {
    world.fixedStep(1 / 60);
    renderer.render(scene, camera);
    controls.update();
    cannonDebugger.update() // Update the CannonDebugger meshes
    requestAnimationFrame(animate);

    for (var i = 0; i <= pool_balls[0].length-1; i++){
        sync_balls(pool_balls[0][i],pool_balls[1][i]);
    }
}

animate();

// Timeout Functions===============================================================

setTimeout(function() {
    pool_balls[1][0].applyImpulse(new CANNON.Vec3(-1, Math.random()*0.02-0.5, 0)); //Add a force to the cue ball

}, 3100);