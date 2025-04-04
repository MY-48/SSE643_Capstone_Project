// SSE 643: Capstone Project
// Michael Young

import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/Addons.js';

// Create scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

const textureLoader = new THREE.TextureLoader();

//Window Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Function to extract a specific texture region
function getTextureRegion(index) {
    var file_path = "assets/pool_balls/texture_"+index+".png";
    const texture = textureLoader.load(file_path);  // Make sure the path is correct
    return texture;
}

// Function to create pool ball meshes
function gen_pool_ball(ball){
    const ballGeo = new THREE.SphereGeometry(1,32,32);
    const ballMat = new THREE.MeshStandardMaterial({
        map: getTextureRegion(ball),
        roughness: 0.05
    });
    const ballModel = new THREE.Mesh(ballGeo, ballMat);
    ballModel.position.set(ball*2,0,0);
    scene.add(ballModel);
}

for(var i = 1; i <= 16; i++){
    gen_pool_ball(i);
}

// Set camera starting position
camera.position.set(0,5,-5);
//camera.lookAt(0,0,0);

scene.background = new THREE.Color(0x444444);

const light = new THREE.AmbientLight(0xffffff, 3);
scene.add(light);

// Animation Loop
function animate() {
    renderer.render(scene, camera);
    controls.update();
    requestAnimationFrame(animate);
}

animate();