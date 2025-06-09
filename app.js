import { auth, db, ref, onValue, update } from './firebase.js';

// DOM Elements
const app = document.getElementById('app');
const authScreen = document.getElementById('auth-screen');
const hubScreen = document.getElementById('hub-screen');
const loadingScreen = document.getElementById('loading-screen');

// State
let currentUser = null;
let userData = {};

// Initialize
function init() {
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      loadUserData(user.uid);
    } else {
      showAuthScreen();
    }
  });
  
  detectPerformance();
}

// Auth Functions
async function register(email, password, username, captchas) {
  try {
    // TCaptcha validation would go here
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    await userCredential.user.updateProfile({ displayName: username });
    
    await set(ref(db, `users/${userCredential.user.uid}`), {
      username,
      email,
      level: 1,
      coins: 100,
      wpm: 0,
      tier: 'bronze',
      contacts: {},
      groups: {}
    });
    
    return true;
  } catch (error) {
    console.error("Registration error:", error);
    return false;
  }
}

async function login(email, password) {
  try {
    await auth.signInWithEmailAndPassword(email, password);
    return true;
  } catch (error) {
    console.error("Login error:", error);
    return false;
  }
}

// User Data
function loadUserData(uid) {
  showLoadingScreen();
  onValue(ref(db, `users/${uid}`), (snapshot) => {
    userData = snapshot.val() || {};
    showHubScreen();
  });
}

// UI Screens
function showLoadingScreen() {
  loadingScreen.style.display = 'block';
  authScreen.style.display = 'none';
  hubScreen.style.display = 'none';
}

function showAuthScreen() {
  loadingScreen.style.display = 'none';
  authScreen.style.display = 'block';
  hubScreen.style.display = 'none';
}

function showHubScreen() {
  loadingScreen.style.display = 'none';
  authScreen.style.display = 'none';
  hubScreen.style.display = 'block';
  updateHubUI();
}

// Performance
function detectPerformance() {
  const cores = navigator.hardwareConcurrency || 2;
  const memory = navigator.deviceMemory || 2;
  document.body.classList.add(cores <= 2 && memory <= 2 ? 'low-end' : 
                           cores <= 4 && memory <= 4 ? 'mid-end' : 'high-end');
}

// Initialize
init();
