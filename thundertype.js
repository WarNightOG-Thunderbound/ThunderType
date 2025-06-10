// ======================
// Firebase Configuration
// ======================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  onValue,
  push,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-database.js";
import {
  getStorage,
  uploadBytes,
  ref as storageRef
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDq8efgFjoLFyiJOvM7pJEUOAgr5NSrHqo",
  authDomain: "thundertype-7ba0d.firebaseapp.com",
  projectId: "thundertype-7ba0d",
  storageBucket: "thundertype-7ba0d.firebasestorage.app",
  messagingSenderId: "38206745209",
  appId: "1:38206745209:web:d1a3dba72aa5c0466a42a8",
  databaseURL: "https://thundertype-7ba0d-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

// =================
// Core Application
// =================
class ThunderType {
  constructor() {
    this.currentUser = null;
    this.userData = null;
    this.activeTab = 'hub';
    this.performanceProfile = 'mid-end';
    this.init();
  }

  async init() {
    this.detectPerformance();
    this.setupAuthListener();
    this.renderLoadingScreen();
  }

  detectPerformance() {
    const start = performance.now();
    let count = 0;
    for (let i = 0; i < 1000000; i++) count += Math.sqrt(i);
    const duration = performance.now() - start;

    if (duration > 100) this.performanceProfile = 'low-end';
    else if (duration > 50) this.performanceProfile = 'mid-end';
    else this.performanceProfile = 'high-end';

    document.body.classList.add(this.performanceProfile);
  }

  setupAuthListener() {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        this.currentUser = user;
        this.loadUserData();
        this.renderHub();
      } else {
        this.renderAuthScreen();
      }
    });
  }

  async loadUserData() {
    const userRef = ref(db, `users/${this.currentUser.uid}`);
    onValue(userRef, (snapshot) => {
      this.userData = snapshot.val() || {};
      this.updateUI();
    });
  }

  // ==============
  // UI Rendering
  // ==============
  renderLoadingScreen() {
    const tips = [
      "Keep your fingers on the home row for better typing speed",
      "Practice regularly to improve your muscle memory",
      "Try to type without looking at your keyboard"
    ];
    const tip = tips[Math.floor(Math.random() * tips.length)];

    document.getElementById('app').innerHTML = `
      <div class="loading-screen">
        <div class="spinner"></div>
        <p class="tip">${tip}</p>
      </div>
    `;
  }

  renderAuthScreen() {
    document.getElementById('app').innerHTML = `
      <div class="auth-container">
        <div class="auth-form" id="login-form">
          <h2>Login</h2>
          <input type="email" id="login-email" placeholder="Email">
          <input type="password" id="login-password" placeholder="Password">
          <button id="login-btn">Login</button>
          <p class="switch-mode">Don't have an account? <a href="#" id="show-register">Register</a></p>
        </div>

        <div class="auth-form" id="register-form" style="display:none">
          <h2>Register</h2>
          <input type="email" id="register-email" placeholder="Email">
          <input type="password" id="register-password" placeholder="Password">

          <div class="tcaptcha-container" id="tcaptcha-1"></div>
          <div class="tcaptcha-container" id="tcaptcha-2"></div>
          <div class="tcaptcha-container" id="tcaptcha-3"></div>

          <button id="register-btn">Register</button>
          <p class="switch-mode">Already have an account? <a href="#" id="show-login">Login</a></p>
        </div>
      </div>
    `;

    document.getElementById('show-register').addEventListener('click', () => {
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('register-form').style.display = 'block';
      this.generateTCaptchas();
    });

    document.getElementById('show-login').addEventListener('click', () => {
      document.getElementById('register-form').style.display = 'none';
      document.getElementById('login-form').style.display = 'block';
    });

    document.getElementById('login-btn').addEventListener('click', this.handleLogin.bind(this));
    document.getElementById('register-btn').addEventListener('click', this.handleRegister.bind(this));
  }

  renderHub() {
    document.getElementById('app').innerHTML = `
      <div class="hub-container">
        <header class="hub-header">
          <div class="user-info">
            <span class="username">${this.userData.username || 'User'}</span>
            <span class="level">Level ${this.userData.level || 1}</span>
            <span class="coins">${this.userData.coins || 0} coins</span>
          </div>
          <div class="performance-indicator ${this.performanceProfile}">
            ${this.performanceProfile} mode
          </div>
        </header>

        <nav class="hub-nav">
          <button class="nav-btn active" data-tab="hub">Hub</button>
          <button class="nav-btn" data-tab="levels">Levels</button>
          <button class="nav-btn" data-tab="lessons">Lessons</button>
          <button class="nav-btn" data-tab="posts">Posts</button>
          <button class="nav-btn" data-tab="contacts">Contacts</button>
          <button class="nav-btn" data-tab="groups">Groups</button>
          <button class="nav-btn" data-tab="games">Games</button>
        </nav>

        <main class="hub-content" id="hub-content">
          </main>
      </div>
    `;

    // Add tab event listeners
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.activeTab = e.target.dataset.tab;
        this.loadTabContent();
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });

    // Load initial tab
    this.loadTabContent();
  }

  loadTabContent() {
    const contentEl = document.getElementById('hub-content');

    switch(this.activeTab) {
      case 'hub':
        this.renderHubContent(contentEl);
        break;
      case 'levels':
        this.renderLevelsContent(contentEl);
        break;
      // Other tabs...
    }
  }

  renderHubContent(container) {
    container.innerHTML = `
      <div class="hub-welcome">
        <h2>Welcome back, ${this.userData.username || 'Typist'}!</h2>
        <div class="stats">
          <div class="stat">
            <span class="stat-value">${this.userData.wpm || 0}</span>
            <span class="stat-label">WPM</span>
          </div>
          <div class="stat">
            <span class="stat-value">${this.userData.level || 1}</span>
            <span class="stat-label">Level</span>
          </div>
          <div class="stat">
            <span class="stat-value">${this.userData.coins || 0}</span>
            <span class="stat-label">Coins</span>
          </div>
        </div>
      </div>

      <div class="activity-feed">
        <h3>Recent Activity</h3>
        <div id="posts-feed"></div>
      </div>
    `;

    // Load posts
    this.loadPosts();
  }

  // ==============
  // TCaptcha System
  // ==============
  async generateTCaptchas() {
    const types = ['math', 'sequence', 'word'];
    this.currentCaptchas = [];

    for (let i = 1; i <= 3; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const captcha = await this.createTCaptcha(type);
      this.currentCaptchas.push(captcha);
      document.getElementById(`tcaptcha-${i}`).innerHTML = `
        <p class="tcaptcha-question">${captcha.question}</p>
        <input type="text" class="tcaptcha-answer" data-id="${i}" placeholder="Your answer">
      `;
    }
  }

  createTCaptcha(type) {
    switch(type) {
      case 'math':
        const a = Math.floor(Math.random() * 10);
        const b = Math.floor(Math.random() * 10);
        return {
          type: 'math',
          question: `${a} + ${b} = ?`,
          answer: (a + b).toString()
        };
      case 'sequence':
        const seq = ['A', 'B', 'C', 'D'];
        const shuffled = [...seq].sort(() => 0.5 - Math.random());
        return {
          type: 'sequence',
          question: `Put these in order: ${shuffled.join(', ')}`,
          answer: seq.join(',')
        };
      case 'word':
        const words = ['apple', 'banana', 'cherry'];
        const selected = words[Math.floor(Math.random() * words.length)];
        return {
          type: 'word',
          question: `Type the word: ${selected.split('').map(c => c.toUpperCase()).join(' ')}`,
          answer: selected
        };
    }
  }

  validateTCaptchas() {
    if (!this.currentCaptchas) return false;

    const answers = Array.from(document.querySelectorAll('.tcaptcha-answer')).map(input => ({
      id: parseInt(input.dataset.id),
      value: input.value.trim()
    }));

    return this.currentCaptchas.every((captcha, index) => {
      const userAnswer = answers.find(a => a.id === index + 1);
      return userAnswer && userAnswer.value === captcha.answer;
    });
  }

  // ==============
  // Auth Handlers
  // ==============
  async handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert(`Login failed: ${error.message}`);
    }
  }

  async handleRegister() {
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    if (!this.validateTCaptchas()) {
      alert('Please complete all captchas correctly');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await this.initializeUserData(userCredential.user.uid);
    } catch (error) {
      alert(`Registration failed: ${error.message}`);
    }
  }

  async initializeUserData(uid) {
    await set(ref(db, `users/${uid}`), {
      username: `user${Math.floor(Math.random() * 10000)}`,
      level: 1,
      coins: 100,
      tier: 'bronze',
      wpm: 0,
      contacts: {},
      groups: {},
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      performanceProfile: this.performanceProfile
    });
  }

  // ==============
  // Posts System
  // ==============
  loadPosts() {
    const postsRef = ref(db, 'posts');
    onValue(postsRef, (snapshot) => {
      const posts = snapshot.val() || {};
      const postsList = Object.entries(posts)
        .map(([id, post]) => ({ id, ...post }))
        .sort((a, b) => b.timestamp - a.timestamp);

      this.renderPosts(postsList);
    });
  }

  renderPosts(posts) {
    const container = document.getElementById('posts-feed');
    if (!container) return;

    container.innerHTML = posts.map(post => `
      <div class="post" data-id="${post.id}">
        <div class="post-header">
          <span class="post-author">${post.authorName || 'Anonymous'}</span>
          <span class="post-time">${new Date(post.timestamp).toLocaleString()}</span>
        </div>
        <div class="post-content">${post.content}</div>
        <div class="post-actions">
          <button class="like-btn" data-id="${post.id}">
            👍 ${Object.keys(post.likes || {}).length}
          </button>
          <button class="heart-btn" data-id="${post.id}">
            ❤️ ${Object.keys(post.hearts || {}).length}
          </button>
        </div>
      </div>
    `).join('');

    // Add event listeners
    document.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', () => this.handleLike(btn.dataset.id));
    });

    document.querySelectorAll('.heart-btn').forEach(btn => {
      btn.addEventListener('click', () => this.handleHeart(btn.dataset.id));
    });
  }

  handleLike(postId) {
    if (!this.currentUser) return;
    const likeRef = ref(db, `posts/${postId}/likes/${this.currentUser.uid}`);
    set(likeRef, true);
  }

  handleHeart(postId) {
    if (!this.currentUser) return;
    const heartRef = ref(db, `posts/${postId}/hearts/${this.currentUser.uid}`);
    set(heartRef, true);
  }

  // ==============
  // Other Tab Contents
  // ==============
  renderLevelsContent(container) {
    container.innerHTML = `
      <div class="levels-container">
        <h2>Typing Levels</h2>
        <div class="levels-grid" id="levels-grid"></div>
      </div>
    `;

    this.loadLevels();
  }

  async loadLevels() {
    const levelsRef = ref(db, 'levels');
    onValue(levelsRef, (snapshot) => {
      const levels = snapshot.val() || {};
      this.renderLevels(levels);
    });
  }

  renderLevels(levels) {
    const container = document.getElementById('levels-grid');
    if (!container) return;

    container.innerHTML = Object.entries(levels)
      .sort(([idA, levelA], [idB, levelB]) => levelA.requiredLevel - levelB.requiredLevel)
      .map(([id, level]) => `
        <div class="level-card ${this.userData.level >= level.requiredLevel ? 'unlocked' : 'locked'}">
          <h3>${level.title}</h3>
          <p>${level.description || 'Test your typing skills'}</p>
          <p>Required Level: ${level.requiredLevel}</p>
          ${this.userData.level >= level.requiredLevel ?
            `<button class="start-level" data-id="${id}">Start</button>` :
            '<div class="locked-label">Locked</div>'}
        </div>
      `).join('');

    document.querySelectorAll('.start-level').forEach(btn => {
      btn.addEventListener('click', () => this.startLevel(btn.dataset.id));
    });
  }

  startLevel(levelId) {
    // Implement level starting logic
    console.log(`Starting level ${levelId}`);
  }

  // ==============
  // Initialization
  // ==============
  updateUI() {
    // Update UI elements when user data changes
    const usernameEl = document.querySelector('.username');
    const levelEl = document.querySelector('.level');
    const coinsEl = document.querySelector('.coins');

    if (usernameEl) usernameEl.textContent = this.userData.username || 'User';
    if (levelEl) levelEl.textContent = `Level ${this.userData.level || 1}`;
    if (coinsEl) coinsEl.textContent = `${this.userData.coins || 0} coins`;
  }
}

// Initialize the app
new ThunderType(); // Changed from 'const app = new ThunderType();' to avoid redeclaration.
