// ======================
// Firebase Configuration
// ======================
// Import Firebase modules using the latest versions
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCustomToken, // Added for Canvas environment
  signInAnonymously // Added for Canvas environment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot, // For real-time updates
  collection,
  query,
  orderBy, // To sort levels
  serverTimestamp,
  addDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  // FieldValue is needed for explicitly deleting fields in Firestore, e.g., for toggling reactions
  FieldValue
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global variables provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfigRaw = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Declare Firebase instances globally (or within the class after initialization)
let appInstance;
let authInstance;
let dbInstance;

console.log('thundertype.js loaded');

// =================
// Core Application
// =================
class ThunderType {
  constructor() {
    console.log('ThunderType constructor called');
    this.currentUser = null;
    this.userData = null;
    this.activeTab = 'hub';
    this.performanceProfile = 'mid-end';
    this.isAuthReady = false; // New state to track auth readiness
    this.currentLevelText = ''; // Stores the text for the current typing level
    this.typedText = ''; // Stores what the user has typed
    this.errors = 0; // Counts typing errors
    this.correctChars = 0; // Counts correctly typed characters
    this.startTime = 0; // For WPM calculation
    this.timerInterval = null; // For the typing timer
    this.typingActive = false; // Flag to indicate if typing session is active

    // Display loading screen immediately, before any complex initialization
    this.renderLoadingScreen();

    // Begin main initialization process
    this.init();
  }

  async init() {
    console.log('init() called');
    this.detectPerformance();

    // Initialize Firebase instances if they haven't been initialized yet
    if (!appInstance) {
      try {
        const parsedFirebaseConfig = JSON.parse(firebaseConfigRaw);
        if (Object.keys(parsedFirebaseConfig).length === 0) {
            throw new Error("Firebase config is empty or invalid.");
        }
        appInstance = initializeApp(parsedFirebaseConfig);
        authInstance = getAuth(appInstance);
        dbInstance = getFirestore(appInstance);
        console.log("Firebase initialized successfully.");
      } catch (error) {
        console.error("Firebase initialization failed:", error);
        // Display an error screen if Firebase initialization fails
        document.getElementById('app').innerHTML = `
          <div class="error-screen flex flex-col items-center justify-center h-screen bg-red-100 text-red-800 p-4">
            <p class="text-2xl font-bold mb-4 text-center">Error: Application Failed to Load</p>
            <p class="text-lg text-center">Please check the console for details or contact support.</p>
            <p class="text-sm mt-4 text-center">Error Message: <span class="font-mono text-red-900">${error.message}</span></p>
          </div>
        `;
        return; // Stop further initialization as Firebase is critical
      }
    }

    // Assign the initialized instances to the class properties
    this.app = appInstance;
    this.auth = authInstance;
    this.db = dbInstance;

    this.setupAuthListener();
    this.setupCustomCursor(); // Ensure cursor is set up after initial render
  }

  detectPerformance() {
    // This performance detection is a simple heuristic and might need fine-tuning
    const start = performance.now();
    let count = 0;
    for (let i = 0; i < 1000000; i++) count += Math.sqrt(i);
    const duration = performance.now() - start;

    if (duration > 100) this.performanceProfile = 'low-end';
    else if (duration > 50) this.performanceProfile = 'mid-end';
    else this.performanceProfile = 'high-end';

    document.body.classList.add(this.performanceProfile);
    console.log(`Performance Profile: ${this.performanceProfile}`);
  }

  setupAuthListener() {
    // Use the initialized auth instance
    onAuthStateChanged(this.auth, async (user) => {
      console.log('onAuthStateChanged fired. User:', user);
      if (initialAuthToken && !this.currentUser) {
        // Sign in with custom token if available and not already signed in
        try {
          await signInWithCustomToken(this.auth, initialAuthToken);
          console.log('Signed in with custom token.');
        } catch (error) {
          console.error('Error signing in with custom token:', error);
          // Fallback to anonymous if custom token fails
          try {
            await signInAnonymously(this.auth);
            console.log('Signed in anonymously after custom token failure.');
          } catch (anonError) {
            console.error('Error signing in anonymously:', anonError);
          }
        }
      } else if (!user) {
        // Sign in anonymously if no user and no initial token (or token failed)
        try {
          await signInAnonymously(this.auth);
          console.log('Signed in anonymously.');
        } catch (error) {
          console.error('Error signing in anonymously:', error);
        }
      }

      this.currentUser = this.auth.currentUser; // Update current user after potential sign-in
      this.isAuthReady = true; // Auth state is now determined

      if (this.currentUser) {
        console.log('User is logged in:', this.currentUser.uid);
        this.loadUserData();
        // Only render hub after user data is loaded/initialized to avoid flickering
      } else {
        console.log('No user logged in, rendering auth screen.');
        this.renderAuthScreen();
      }
    });
  }

  async loadUserData() {
    // Ensure Firebase is initialized and auth is ready
    if (!this.currentUser || !this.isAuthReady || !this.db) {
        console.warn('loadUserData called before Firebase/Auth is ready.');
        return;
    }

    // Use a unique path for user data based on appId and userId for Firestore
    const userDocRef = doc(this.db, `artifacts/${appId}/users/${this.currentUser.uid}/userData/profile`);
    console.log('Attempting to load user data from:', userDocRef.path);

    onSnapshot(userDocRef, async (docSnap) => {
      console.log('User data snapshot received.');
      if (docSnap.exists()) {
        this.userData = docSnap.data();
        console.log('User data loaded:', this.userData);
      } else {
        // Initialize new user data if it doesn't exist
        console.log('No user data found, initializing new user data...');
        await this.initializeUserData(this.currentUser.uid);
      }
      this.updateUI();
      // Only render hub/main UI *after* user data has been successfully loaded or initialized
      this.renderHub();
    }, (error) => {
      console.error('Error loading user data via onSnapshot:', error);
      this.showMessage(`Error loading user data: ${error.message}`, 'error');
      // Render hub even on error to prevent being stuck on loading
      this.renderHub();
    });
  }

  // ==============
  // UI Rendering
  // ==============
  renderLoadingScreen() {
    console.log('renderLoadingScreen() called');
    const tips = [
      "Keep your fingers on the home row for better typing speed",
      "Practice regularly to improve your muscle memory",
      "Try to type without looking at your keyboard",
      "Focus on accuracy before speed",
      "Use all your fingers, not just two!"
    ];
    const tip = tips[Math.floor(Math.random() * tips.length)];

    document.getElementById('app').innerHTML = `
      <div class="loading-screen flex flex-col items-center justify-center h-screen bg-gray-100">
        <div class="spinner border-t-4 border-blue-500 border-solid rounded-full w-16 h-16 animate-spin"></div>
        <p class="tip text-lg text-gray-700 mt-4">${tip}</p>
      </div>
    `;
  }

  renderAuthScreen() {
    document.getElementById('app').innerHTML = `
      <div class="auth-container min-h-screen flex items-center justify-center bg-gray-100">
        <div class="auth-form bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
          <div id="login-form">
            <h2 class="text-2xl font-bold mb-6 text-center text-gray-800">Login</h2>
            <input type="email" id="login-email" placeholder="Email" class="w-full px-4 py-2 mb-4 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400">
            <input type="password" id="login-password" placeholder="Password" class="w-full px-4 py-2 mb-6 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400">
            <button id="login-btn" class="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors duration-200">Login</button>
            <p class="switch-mode text-center mt-4 text-gray-600">Don't have an account? <a href="#" id="show-register" class="text-blue-600 hover:underline">Register</a></p>
          </div>

          <div id="register-form" style="display:none">
            <h2 class="text-2xl font-bold mb-6 text-center text-gray-800">Register</h2>
            <input type="email" id="register-email" placeholder="Email" class="w-full px-4 py-2 mb-4 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400">
            <input type="password" id="register-password" placeholder="Password" class="w-full px-4 py-2 mb-4 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400">

            <div class="tcaptcha-container mb-4" id="tcaptcha-1"></div>
            <div class="tcaptcha-container mb-4" id="tcaptcha-2"></div>
            <div class="tcaptcha-container mb-6" id="tcaptcha-3"></div>

            <button id="register-btn" class="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors duration-200">Register</button>
            <p class="switch-mode text-center mt-4 text-gray-600">Already have an account? <a href="#" id="show-login" class="text-blue-600 hover:underline">Login</a></p>
          </div>
        </div>
      </div>
    `;

    document.getElementById('show-register').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('register-form').style.display = 'block';
      this.generateTCaptchas();
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('register-form').style.display = 'none';
      document.getElementById('login-form').style.display = 'block';
    });

    document.getElementById('login-btn').addEventListener('click', this.handleLogin.bind(this));
    document.getElementById('register-btn').addEventListener('click', this.handleRegister.bind(this));
  }

  renderHub() {
    document.getElementById('app').innerHTML = `
      <div class="hub-container min-h-screen flex flex-col bg-gray-100">
        <header class="hub-header bg-white shadow-md p-4 flex justify-between items-center">
          <div class="user-info flex items-center space-x-4">
            <span class="username font-semibold text-lg text-gray-800">${this.userData?.username || 'User'}</span>
            <span class="level text-gray-600">Level ${this.userData?.level || 1}</span>
            <span class="coins text-yellow-600">${this.userData?.coins || 0} <i class="fas fa-coins"></i></span>
            <span class="text-gray-600 text-sm">UID: ${this.currentUser?.uid || 'N/A'}</span>
          </div>
          <div class="performance-indicator ${this.performanceProfile} px-3 py-1 rounded-full text-sm">
            ${this.performanceProfile} mode
          </div>
        </header>

        <nav class="hub-nav bg-white shadow-sm flex justify-center border-b border-gray-200">
          <button class="nav-btn ${this.activeTab === 'hub' ? 'active' : ''} px-6 py-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors duration-200" data-tab="hub">Hub</button>
          <button class="nav-btn ${this.activeTab === 'levels' ? 'active' : ''} px-6 py-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors duration-200" data-tab="levels">Levels</button>
          <button class="nav-btn ${this.activeTab === 'lessons' ? 'active' : ''} px-6 py-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors duration-200" data-tab="lessons">Lessons</button>
          <button class="nav-btn ${this.activeTab === 'typing' ? 'active' : ''} px-6 py-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors duration-200" data-tab="typing">Typing Practice</button>
          <button class="nav-btn ${this.activeTab === 'posts' ? 'active' : ''} px-6 py-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors duration-200" data-tab="posts">Posts</button>
          <button class="nav-btn ${this.activeTab === 'contacts' ? 'active' : ''} px-6 py-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors duration-200" data-tab="contacts">Contacts</button>
          <button class="nav-btn ${this.activeTab === 'groups' ? 'active' : ''} px-6 py-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors duration-200" data-tab="groups">Groups</button>
          <button class="nav-btn ${this.activeTab === 'games' ? 'active' : ''} px-6 py-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors duration-200" data-tab="games">Games</button>
        </nav>

        <main class="hub-content p-6 flex-grow overflow-y-auto bg-gray-50 rounded-b-lg">
          <div id="hub-content-display"></div>
        </main>
      </div>
    `;

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.activeTab = e.target.dataset.tab;
        this.loadTabContent();
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });

    this.loadTabContent();
  }

  loadTabContent() {
    const contentEl = document.getElementById('hub-content-display');
    if (!contentEl) return;

    switch(this.activeTab) {
      case 'hub':
        this.renderHubContent(contentEl);
        break;
      case 'levels':
        this.renderLevelsContent(contentEl);
        break;
      case 'lessons':
        this.renderLessonsContent(contentEl);
        break;
      case 'typing':
        this.renderTypingPractice(contentEl);
        break;
      case 'posts':
        this.renderPostsTab(contentEl); // Render a dedicated posts tab
        break;
      case 'contacts':
        this.renderContactsTab(contentEl);
        break;
      case 'groups':
        this.renderGroupsTab(contentEl);
        break;
      case 'games':
        this.renderGamesTab(contentEl);
        break;
      default:
        contentEl.innerHTML = '<p class="text-center text-gray-500">Select a tab above.</p>';
    }
  }

  renderHubContent(container) {
    container.innerHTML = `
      <div class="hub-welcome bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 class="text-3xl font-bold mb-4 text-gray-800">Welcome back, ${this.userData?.username || 'Typist'}!</h2>
        <div class="stats grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div class="stat bg-blue-100 p-4 rounded-md shadow-sm">
            <span class="stat-value text-4xl font-bold text-blue-700">${this.userData?.wpm || 0}</span>
            <span class="stat-label text-gray-600 block mt-1">WPM</span>
          </div>
          <div class="stat bg-green-100 p-4 rounded-md shadow-sm">
            <span class="stat-value text-4xl font-bold text-green-700">${this.userData?.level || 1}</span>
            <span class="stat-label text-gray-600 block mt-1">Level</span>
          </div>
          <div class="stat bg-yellow-100 p-4 rounded-md shadow-sm">
            <span class="stat-value text-4xl font-bold text-yellow-700">${this.userData?.coins || 0}</span>
            <span class="stat-label text-gray-600 block mt-1">Coins</span>
          </div>
        </div>
      </div>

      <div class="activity-feed bg-white p-6 rounded-lg shadow-md">
        <h3 class="text-2xl font-bold mb-4 text-gray-800">Recent Activity</h3>
        <div id="posts-feed"></div>
      </div>
    `;
    this.loadPosts('posts-feed'); // Load posts into the activity feed
  }

  // ==============
  // TCaptcha System (Kept as is for now)
  // ==============
  async generateTCaptchas() {
    const types = ['math', 'sequence', 'word'];
    this.currentCaptchas = [];

    for (let i = 1; i <= 3; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const captcha = await this.createTCaptcha(type);
      this.currentCaptchas.push(captcha);
      const captchaEl = document.getElementById(`tcaptcha-${i}`);
      if (captchaEl) {
        captchaEl.innerHTML = `
          <p class="tcaptcha-question text-gray-700 mb-2">${captcha.question}</p>
          <input type="text" class="tcaptcha-answer w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-gray-300" data-id="${i}" placeholder="Your answer">
        `;
      }
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
        const words = ['apple', 'banana', 'cherry', 'grape', 'kiwi'];
        const selected = words[Math.floor(Math.random() * words.length)];
        return {
          type: 'word',
          question: `Type the word: ${selected.split('').map(c => c.toUpperCase()).join(' ')}`,
          answer: selected
        };
      default:
        return { type: 'unknown', question: '', answer: '' };
    }
  }

  validateTCaptchas() {
    if (!this.currentCaptchas) return false;

    const answers = Array.from(document.querySelectorAll('.tcaptcha-answer')).map(input => ({
      id: parseInt(input.dataset.id),
      value: input.value.trim().toLowerCase() // Normalize input
    }));

    return this.currentCaptchas.every((captcha, index) => {
      const userAnswer = answers.find(a => a.id === index + 1);
      return userAnswer && userAnswer.value === captcha.answer.toLowerCase();
    });
  }

  // ==============
  // Auth Handlers (Updated for Firestore)
  // ==============
  async handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      await signInWithEmailAndPassword(this.auth, email, password);
      // Auth listener will handle rendering hub
    } catch (error) {
      this.showMessage(`Login failed: ${error.message}`, 'error');
    }
  }

  async handleRegister() {
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    if (!this.validateTCaptchas()) {
      this.showMessage('Please complete all captchas correctly', 'warning');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      // Auth listener will handle initializing user data and rendering hub
    } catch (error) {
      this.showMessage(`Registration failed: ${error.message}`, 'error');
    }
  }

  async initializeUserData(uid) {
    if (!uid) {
        console.error('UID is undefined, cannot initialize user data.');
        return;
    }
    const userDocRef = doc(this.db, `artifacts/${appId}/users/${uid}/userData/profile`);
    const initialData = {
      username: `user${Math.floor(1000 + Math.random() * 9000)}`, // Unique username
      level: 1,
      coins: 100,
      tier: 'bronze',
      wpm: 0,
      accuracy: 0,
      completedLevels: [],
      contacts: {},
      groups: {},
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      performanceProfile: this.performanceProfile
    };
    try {
      await setDoc(userDocRef, initialData, { merge: true }); // Use merge: true to avoid overwriting existing fields
      this.userData = initialData; // Update local state immediately
      console.log('User data initialized for', uid);
    } catch (error) {
      console.error('Error initializing user data:', error);
      this.showMessage(`Error initializing user data: ${error.message}`, 'error');
    }
  }

  async updateUserData(data) {
    if (!this.currentUser || !this.db) {
        console.warn('updateUserData called before Firebase/Auth is ready.');
        return;
    }
    const userDocRef = doc(this.db, `artifacts/${appId}/users/${this.currentUser.uid}/userData/profile`);
    try {
      await updateDoc(userDocRef, data);
      console.log('User data updated:', data);
    } catch (error) {
      console.error('Error updating user data:', error);
      this.showMessage(`Error updating user data: ${error.message}`, 'error');
    }
  }

  // ==============
  // Posts System (Updated for Firestore)
  // ==============
  renderPostsTab(container) {
    container.innerHTML = `
      <div class="posts-container p-6 bg-white rounded-lg shadow-md">
        <h2 class="text-2xl font-bold mb-4 text-gray-800">Community Posts</h2>
        <div class="mb-6">
          <textarea id="new-post-content" class="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400" rows="3" placeholder="Write a new post..."></textarea>
          <button id="submit-post-btn" class="mt-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200">Submit Post</button>
        </div>
        <div id="posts-list"></div>
      </div>
    `;
    document.getElementById('submit-post-btn').addEventListener('click', this.handleSubmitPost.bind(this));
    this.loadPosts('posts-list'); // Load posts into the dedicated list
  }

  async handleSubmitPost() {
    if (!this.currentUser || !this.db) {
      this.showMessage('Please log in to post.', 'warning');
      return;
    }
    const content = document.getElementById('new-post-content').value.trim();
    if (!content) {
      this.showMessage('Post content cannot be empty.', 'warning');
      return;
    }

    try {
      const postsCollectionRef = collection(this.db, `artifacts/${appId}/public/data/posts`);
      await addDoc(postsCollectionRef, {
        authorId: this.currentUser.uid,
        authorName: this.userData?.username || 'Anonymous',
        content: content,
        timestamp: serverTimestamp(),
        likes: {}, // Store likes as a map
        hearts: {} // Store hearts as a map
      });
      document.getElementById('new-post-content').value = ''; // Clear input
      this.showMessage('Post submitted successfully!', 'success');
    } catch (error) {
      console.error('Error submitting post:', error);
      this.showMessage(`Error submitting post: ${error.message}`, 'error');
    }
  }

  loadPosts(containerId) {
    if (!this.db) {
        console.warn('loadPosts called before Firestore is ready.');
        return;
    }
    const postsCollectionRef = collection(this.db, `artifacts/${appId}/public/data/posts`);
    const q = query(postsCollectionRef, orderBy('timestamp', 'desc')); // Order by timestamp

    onSnapshot(q, (snapshot) => {
      const postsList = [];
      snapshot.forEach(doc => {
        postsList.push({ id: doc.id, ...doc.data() });
      });
      this.renderPosts(postsList, containerId);
    }, (error) => {
      console.error('Error loading posts:', error);
      this.showMessage('Error loading posts.', 'error');
    });
  }

  renderPosts(posts, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = posts.map(post => `
      <div class="post bg-gray-50 p-4 rounded-lg shadow-sm mb-4" data-id="${post.id}">
        <div class="post-header text-sm text-gray-500 mb-2">
          <span class="post-author font-semibold text-blue-600">${post.authorName || 'Anonymous'}</span>
          <span class="post-time ml-2">${post.timestamp ? new Date(post.timestamp.toDate()).toLocaleString() : 'Loading...'}</span>
        </div>
        <div class="post-content text-gray-800 text-lg mb-3">${post.content}</div>
        <div class="post-actions flex space-x-4">
          <button class="like-btn flex items-center px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm hover:bg-blue-200 transition-colors duration-200" data-id="${post.id}">
            <i class="far fa-thumbs-up mr-1"></i> ${Object.keys(post.likes || {}).length}
          </button>
          <button class="heart-btn flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm hover:bg-red-200 transition-colors duration-200" data-id="${post.id}">
            <i class="far fa-heart mr-1"></i> ${Object.keys(post.hearts || {}).length}
          </button>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', () => this.handleReaction(btn.dataset.id, 'likes'));
    });

    document.querySelectorAll('.heart-btn').forEach(btn => {
      btn.addEventListener('click', () => this.handleReaction(btn.dataset.id, 'hearts'));
    });
  }

  async handleReaction(postId, type) {
    if (!this.currentUser || !this.db) {
      this.showMessage('Please log in to react.', 'warning');
      return;
    }
    const postDocRef = doc(this.db, `artifacts/${appId}/public/data/posts`, postId);
    const userId = this.currentUser.uid;

    try {
      const docSnap = await getDoc(postDocRef);
      if (docSnap.exists()) {
        const currentReactions = docSnap.data()[type] || {};
        if (currentReactions[userId]) {
          // User already reacted, remove reaction by deleting the field
          await updateDoc(postDocRef, {
              [`${type}.${userId}`]: FieldValue.delete()
          });
        } else {
          // User has not reacted, add reaction
          await updateDoc(postDocRef, {
            [`${type}.${userId}`]: true
          });
        }
      }
    } catch (error) {
      console.error(`Error handling ${type} reaction:`, error);
      this.showMessage(`Error reacting: ${error.message}`, 'error');
    }
  }

  // ==============
  // Levels & Lessons System (Updated for Firestore & dynamic generation)
  // ==============

  // Helper to generate lesson text based on level
  generateLessonText(level) {
    if (level === 1) {
      return "Place your left index finger on 'f', middle on 'd', ring on 's', pinky on 'a'. Place your right index finger on 'j', middle on 'k', ring on 'l', pinky on ';'. Keep thumbs on the spacebar. Practice: f d s a j k l ;";
    } else if (level === 2) {
      return "Focus on 'f' and 'j'. Practice: fff jjj fff jjj fj fj fj";
    } else if (level === 3) {
      return "Focus on 'd' and 'k'. Practice: ddd kkk ddd kkk dk dk dk";
    } else if (level < 10) {
      // Introduce adjacent keys gradually
      const homeRow = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'];
      const currentKeys = homeRow.slice(0, Math.min(homeRow.length, level + 2));
      const exampleText = Array(20).fill(0).map(() => currentKeys[Math.floor(Math.random() * currentKeys.length)]).join('');
      return `Practice home row keys: ${currentKeys.join(', ')}. Type: ${exampleText}`;
    } else if (level < 20) {
      // Introduce E, I, R, U
      const commonLetters = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';', 'e', 'i', 'r', 'u'];
      const exampleText = Array(30).fill(0).map(() => commonLetters[Math.floor(Math.random() * commonLetters.length)]).join('');
      return `New keys: 'e', 'i', 'r', 'u'. Practice: ${exampleText}`;
    } else if (level < 50) {
        // Simple words with common letters
        const simpleWords = ["the", "and", "but", "for", "with", "you", "are", "not", "that", "this", "can", "have"];
        const sentence = Array(5).fill(0).map(() => simpleWords[Math.floor(Math.random() * simpleWords.length)]).join(' ');
        return `Practice common words. Type: "${sentence}".`;
    } else if (level < 100) {
        // Slightly more complex words
        const words = ["apple", "banana", "cherry", "grape", "house", "jungle", "keyboard", "lemon", "mountain", "ocean"];
        const sentence = Array(7).fill(0).map(() => words[Math.floor(Math.random() * words.length)]).join(' ');
        return `Practice longer words. Type: "${sentence}".`;
    } else if (level < 200) {
        // Introduce punctuation and capitalization
        const text = "The quick brown fox jumps over the lazy dog. How quickly you type!";
        // Randomly select a substring or modify it
        const start = Math.floor(Math.random() * (text.length - 30));
        const end = start + 30 + Math.floor(Math.random() * 20);
        return `Focus on accuracy and special characters. Type: "${text.substring(start, end).trim()}".`;
    } else {
      // Generate longer, more complex sentences for higher levels
      const sentences = [
        "The early bird catches the worm, but the second mouse gets the cheese.",
        "Technology has advanced at an incredible pace, changing our lives dramatically.",
        "Learning a new skill requires dedication, patience, and consistent practice.",
        "The sun always shines brightest after the rain, bringing hope and new beginnings.",
        "To improve your typing speed, focus on rhythm and try not to look at the keyboard.",
        "Practice makes perfect, especially when it comes to mastering touch typing.",
        "The swift brown fox jumps over the lazy dog and then takes a nap.",
        "Efficient communication relies on clear, concise, and accurate typing skills.",
        "Developing good typing habits early on will benefit you throughout your life."
      ];
      const selectedSentence = sentences[Math.floor(Math.random() * sentences.length)];
      return `Advanced practice. Focus on flow and speed. Type: "${selectedSentence}".`;
    }
  }

  renderLevelsContent(container) {
    container.innerHTML = `
      <div class="levels-container p-6 bg-white rounded-lg shadow-md">
        <h2 class="text-2xl font-bold mb-4 text-gray-800">Typing Levels (1-500)</h2>
        <p class="text-gray-600 mb-6">Unlock new challenges and improve your WPM!</p>
        <div class="levels-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="levels-grid">
          <!-- Levels will be loaded here -->
        </div>
      </div>
    `;
    this.loadLevels();
  }

  async loadLevels() {
    // Generate levels dynamically for demonstration up to 100 WPM, which is approx level 500
    // In a real app, you might only generate levels close to the user's current level
    const allLevels = [];
    for (let i = 1; i <= 500; i++) {
        const targetWPM = Math.min(100, Math.floor(i / 5) + 1); // Progress from 1 WPM to 100 WPM over 500 levels
        allLevels.push({
            id: `level-${i}`,
            title: `Level ${i} - Target WPM: ${targetWPM}`,
            description: `Master this level to reach ${targetWPM} WPM.`,
            requiredLevel: i,
            lessonText: this.generateLessonText(i)
        });
    }
    this.renderLevels(allLevels);
  }

  renderLevels(levels) {
    const container = document.getElementById('levels-grid');
    if (!container) return;

    container.innerHTML = levels
      .filter(level => level.requiredLevel <= (this.userData?.level || 1) + 10) // Only show nearby levels for performance
      .map(level => `
        <div class="level-card bg-gray-50 p-5 rounded-lg shadow-sm ${this.userData?.level >= level.requiredLevel ? 'unlocked border-green-400' : 'locked border-gray-300 opacity-70'}">
          <h3 class="text-xl font-semibold text-gray-800 mb-2">${level.title}</h3>
          <p class="text-gray-600 text-sm mb-3">${level.description || 'Test your typing skills'}</p>
          <p class="text-gray-500 text-xs mb-4">Required Level: ${level.requiredLevel}</p>
          ${this.userData?.level >= level.requiredLevel ?
            `<button class="start-level bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 transition-colors duration-200" data-id="${level.id}">Start</button>` :
            '<div class="locked-label text-red-500 font-bold">Locked</div>'}
        </div>
      `).join('');

    document.querySelectorAll('.start-level').forEach(btn => {
      btn.addEventListener('click', () => {
        this.startLevel(btn.dataset.id);
        this.activeTab = 'typing'; // Switch to typing tab
        this.loadTabContent(); // Reload tab content
      });
    });
  }

  renderLessonsContent(container) {
    container.innerHTML = `
      <div class="lessons-container p-6 bg-white rounded-lg shadow-md">
        <h2 class="text-2xl font-bold mb-4 text-gray-800">Typing Lessons</h2>
        <p class="text-gray-600 mb-6">Each level comes with a specific lesson to guide your typing journey.</p>
        <div id="lesson-details">
          <p class="text-lg text-gray-700 mb-4">Select a level from the "Levels" tab or below to view its lesson.</p>
        </div>
        <div class="lessons-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="lessons-grid">
            <!-- Lessons will be displayed here -->
        </div>
      </div>
    `;
    this.loadLessonsList();
  }

  loadLessonsList() {
    const allLevels = [];
    for (let i = 1; i <= 500; i++) {
        const targetWPM = Math.min(100, Math.floor(i / 5) + 1);
        allLevels.push({
            id: `level-${i}`,
            title: `Level ${i} - Target WPM: ${targetWPM}`,
            description: `Master this level to reach ${targetWPM} WPM.`,
            requiredLevel: i,
            lessonText: this.generateLessonText(i)
        });
    }
    this.renderLessonsList(allLevels);
  }

  renderLessonsList(levels) {
    const container = document.getElementById('lessons-grid');
    if (!container) return;

    container.innerHTML = levels
      .filter(level => level.requiredLevel <= (this.userData?.level || 1) + 10) // Show nearby lessons
      .map(level => `
        <div class="lesson-card bg-gray-50 p-5 rounded-lg shadow-sm ${this.userData?.level >= level.requiredLevel ? 'unlocked border-green-400' : 'locked border-gray-300 opacity-70'}">
          <h3 class="text-xl font-semibold text-gray-800 mb-2">${level.title}</h3>
          <p class="text-gray-600 text-sm mb-3">
             <span class="font-semibold">Lesson:</span> ${level.lessonText.substring(0, 80)}...
          </p>
          ${this.userData?.level >= level.requiredLevel ?
            `<button class="view-lesson bg-indigo-600 text-white px-5 py-2 rounded-md hover:bg-indigo-700 transition-colors duration-200" data-id="${level.id}">View Lesson</button>` :
            '<div class="locked-label text-red-500 font-bold">Locked</div>'}
        </div>
      `).join('');

    document.querySelectorAll('.view-lesson').forEach(btn => {
      btn.addEventListener('click', () => this.displayLesson(btn.dataset.id));
    });
  }

  displayLesson(levelId) {
    const levelNumber = parseInt(levelId.replace('level-', ''));
    const lessonText = this.generateLessonText(levelNumber);
    const lessonDetailsContainer = document.getElementById('lesson-details');
    if (lessonDetailsContainer) {
      lessonDetailsContainer.innerHTML = `
        <h3 class="text-xl font-bold mb-2 text-gray-800">Lesson for Level ${levelNumber}</h3>
        <p class="text-gray-700 text-lg">${lessonText}</p>
        <button class="start-lesson-practice bg-blue-600 text-white px-5 py-2 rounded-md mt-4 hover:bg-blue-700 transition-colors duration-200" data-id="${levelId}">Start Practice for this Lesson</button>
      `;
      document.querySelector('.start-lesson-practice').addEventListener('click', () => {
        this.startLevel(levelId);
        this.activeTab = 'typing'; // Switch to typing tab
        this.loadTabContent(); // Reload tab content
      });
    }
  }

  // ==============
  // Typing Practice Game
  // ==============
  renderTypingPractice(container) {
    container.innerHTML = `
      <div class="typing-container p-6 bg-white rounded-lg shadow-md flex flex-col items-center justify-center">
        <h2 class="text-2xl font-bold mb-4 text-gray-800">Typing Practice</h2>
        <div class="text-to-type border border-gray-300 bg-gray-50 p-6 rounded-md w-full max-w-2xl text-xl leading-relaxed font-mono mb-6 text-gray-800" id="text-to-type">
          <span id="correct-text"></span><span id="current-char"></span><span id="remaining-text"></span>
        </div>
        <input type="text" id="typing-input" class="w-full max-w-2xl px-4 py-3 border border-blue-400 rounded-md text-xl focus:outline-none focus:ring-2 focus:ring-blue-600 mb-6 font-mono" placeholder="Start typing here..." autocomplete="off" autocapitalize="off" spellcheck="false">

        <div class="stats-display grid grid-cols-2 gap-4 w-full max-w-2xl mb-6">
          <div class="stat-box bg-blue-100 p-4 rounded-md text-center">
            <div class="text-3xl font-bold text-blue-700" id="wpm-display">0</div>
            <div class="text-gray-600">WPM</div>
          </div>
          <div class="stat-box bg-green-100 p-4 rounded-md text-center">
            <div class="text-3xl font-bold text-green-700" id="accuracy-display">100%</div>
            <div class="text-gray-600">Accuracy</div>
          </div>
        </div>

        <button id="restart-btn" class="bg-gray-500 text-white px-6 py-3 rounded-md hover:bg-gray-600 transition-colors duration-200">Restart Practice</button>
      </div>
    `;

    // Initialize typing input listener after rendering
    this.typingInput = document.getElementById('typing-input');
    this.textToTypeDisplay = document.getElementById('text-to-type');
    this.wpmDisplay = document.getElementById('wpm-display');
    this.accuracyDisplay = document.getElementById('accuracy-display');
    this.restartBtn = document.getElementById('restart-btn');

    this.restartBtn.addEventListener('click', () => this.startLevel(this.currentLevelId || `level-${this.userData?.level || 1}`)); // Restart current level or user's level
    this.typingInput.addEventListener('keydown', this.handleTypingInput.bind(this));
    // The 'input' event listener is useful for immediate visual updates but keydown is for logic
    // this.typingInput.addEventListener('input', this.updateTypingDisplay.bind(this));


    // Initially start level 1 or the user's current level
    this.startLevel(`level-${this.userData?.level || 1}`);
  }

  async startLevel(levelId) {
    this.currentLevelId = levelId;
    const levelNumber = parseInt(levelId.replace('level-', ''));
    this.currentLevelText = this.generateLessonText(levelNumber).replace('Practice:', '').replace('Type:', '').trim();

    this.typedText = '';
    this.errors = 0;
    this.correctChars = 0;
    this.startTime = 0;
    this.typingActive = false;
    clearInterval(this.timerInterval);

    if (this.typingInput) {
        this.typingInput.value = '';
        this.typingInput.focus();
    }
    this.updateTypingDisplay();
    this.updateStatsDisplay();

    this.showMessage(`Starting Level ${levelNumber}! ${this.generateLessonText(levelNumber)}`, 'info', 5000);
  }

  updateTypingDisplay() {
    const targetText = this.currentLevelText;
    const typedText = this.typedText;

    let correctHtml = '';
    let currentCharHtml = '';
    let remainingHtml = '';

    const inputLength = typedText.length;
    const targetLength = targetText.length;

    for (let i = 0; i < targetLength; i++) {
      if (i < inputLength) {
        if (typedText[i] === targetText[i]) {
          correctHtml += `<span class="text-green-600">${targetText[i]}</span>`;
        } else {
          correctHtml += `<span class="text-red-600">${targetText[i]}</span>`;
        }
      } else if (i === inputLength) {
        currentCharHtml = `<span class="current-char bg-blue-200 rounded px-1">${targetText[i] || ''}</span>`;
      } else {
        remainingHtml += `<span class="text-gray-400">${targetText[i]}</span>`;
      }
    }
    // Handle case where user types past the target text length
    if (inputLength > targetLength) {
        for (let i = targetLength; i < inputLength; i++) {
            correctHtml += `<span class="text-red-600">${typedText[i]}</span>`; // Mark extra characters as errors
        }
    }


    if (document.getElementById('correct-text')) document.getElementById('correct-text').innerHTML = correctHtml;
    if (document.getElementById('current-char')) document.getElementById('current-char').innerHTML = currentCharHtml;
    if (document.getElementById('remaining-text')) document.getElementById('remaining-text').innerHTML = remainingHtml;
  }

  handleTypingInput(event) {
    // Only start timer if text is available and we haven't started yet
    if (!this.typingActive && this.currentLevelText.length > 0 && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      this.typingActive = true;
      this.startTime = performance.now();
      this.timerInterval = setInterval(() => {
        this.updateStatsDisplay();
      }, 1000); // Update WPM every second
    }

    if (event.key === 'Backspace') {
        if (this.typedText.length > 0) {
            this.typedText = this.typedText.slice(0, -1);
            // No direct error deduction here, as user is correcting.
            // Errors are only counted on initial incorrect input.
        }
    } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) { // Only process single character inputs (not shift, alt, ctrl, etc.)
        const expectedChar = this.currentLevelText[this.typedText.length];
        const typedChar = event.key;

        if (this.typedText.length < this.currentLevelText.length) {
            if (typedChar === expectedChar) {
              this.correctChars++;
            } else {
              this.errors++;
            }
        } else {
            // If typing past target text, still count as error
            this.errors++;
        }
        this.typedText += typedChar;
    } else if (event.key === ' ' && this.typedText.length === this.currentLevelText.length) {
        // Prevent extra spaces from being typed at the end if the text is complete
        event.preventDefault();
    }


    this.updateTypingDisplay();
    this.updateStatsDisplay();

    if (this.typedText.length >= this.currentLevelText.length && this.typingActive) {
      // Allow slight overshoot, but finish if enough typed
      this.finishLevel();
    }
  }

  updateStatsDisplay() {
    const timeElapsedSeconds = (performance.now() - this.startTime) / 1000;
    const totalTypedChars = this.typedText.length;
    let wpm = 0;
    if (timeElapsedSeconds > 0) {
      // Calculate WPM based on correct characters per minute
      wpm = Math.round((this.correctChars / 5) / timeElapsedSeconds * 60);
    }

    let accuracy = 100;
    if (totalTypedChars > 0) {
      accuracy = Math.round((this.correctChars / totalTypedChars) * 100);
    }

    if (this.wpmDisplay) this.wpmDisplay.textContent = wpm;
    if (this.accuracyDisplay) this.accuracyDisplay.textContent = `${accuracy}%`;
  }

  async finishLevel() {
    console.log('finishLevel called');
    this.typingActive = false;
    clearInterval(this.timerInterval);
    this.updateStatsDisplay(); // Final update

    const finalWPM = parseInt(this.wpmDisplay.textContent);
    const finalAccuracy = parseInt(this.accuracyDisplay.textContent);
    const currentLevel = parseInt(this.currentLevelId.replace('level-', ''));

    let message = `Level Completed! WPM: ${finalWPM}, Accuracy: ${finalAccuracy}%. Errors: ${this.errors}.`;

    // Logic for level progression
    const nextLevel = currentLevel + 1;
    const targetWPMForCurrentLevel = Math.min(100, Math.floor(currentLevel / 5) + 1); // WPM target for *this* level

    if (finalWPM >= targetWPMForCurrentLevel && finalAccuracy >= 90) { // Example criteria
      if (nextLevel <= 500) { // Max level is 500
        message += ` Great job! Unlocked Level ${nextLevel}!`;
        // Update user's level and WPM if new WPM is higher
        if (nextLevel > (this.userData?.level || 0)) {
            await this.updateUserData({
                level: nextLevel,
                wpm: Math.max(this.userData?.wpm || 0, finalWPM), // Update WPM if it's a new high score
                accuracy: finalAccuracy,
                completedLevels: arrayUnion(this.currentLevelId) // Mark level as completed
            });
        } else {
             // Just update WPM if it's higher for the same level
            await this.updateUserData({
                wpm: Math.max(this.userData?.wpm || 0, finalWPM),
                accuracy: finalAccuracy
            });
        }
      } else {
        message += ` You've completed all available levels! Amazing!`;
      }
      this.showMessage(message, 'success', 5000);
    } else {
      message += ` Keep practicing to reach the target WPM of ${targetWPMForCurrentLevel} and 90%+ accuracy!`;
      this.showMessage(message, 'warning', 5000);
    }

    // You could also show a modal here with detailed results
    setTimeout(() => {
      this.activeTab = 'levels'; // Go back to levels screen
      this.loadTabContent();
    }, 5000); // Wait for 5 seconds to show message
  }


  // ==============
  // Other Tab Contents (Placeholder for now)
  // ==============
  renderContactsTab(container) {
    container.innerHTML = `
      <div class="contacts-container p-6 bg-white rounded-lg shadow-md">
        <h2 class="text-2xl font-bold mb-4 text-gray-800">Your Contacts</h2>
        <p class="text-gray-600">This section will allow you to manage your typing buddies!</p>
        <p class="text-gray-600">User ID: <span class="font-bold text-blue-600">${this.currentUser?.uid || 'Not logged in'}</span></p>
      </div>
    `;
  }

  renderGroupsTab(container) {
    container.innerHTML = `
      <div class="groups-container p-6 bg-white rounded-lg shadow-md">
        <h2 class="text-2xl font-bold mb-4 text-gray-800">Your Groups</h2>
        <p class="text-gray-600">Join or create typing groups to practice with friends.</p>
      </div>
    `;
  }

  renderGamesTab(container) {
    container.innerHTML = `
      <div class="games-container p-6 bg-white rounded-lg shadow-md">
        <h2 class="text-2xl font-bold mb-4 text-gray-800">Typing Games</h2>
        <p class="text-gray-600">Fun games to improve your typing skills!</p>
      </div>
    `;
  }

  // ==============
  // Custom Cursor
  // ==============
  setupCustomCursor() {
    const customCursor = document.createElement('div');
    customCursor.id = 'custom-cursor';
    document.body.appendChild(customCursor);

    document.addEventListener('mousemove', (e) => {
      customCursor.style.left = `${e.clientX}px`;
      customCursor.style.top = `${e.clientY}px`;
    });
  }

  // ==============
  // Utility & UI Update
  // ==============
  showMessage(message, type = 'info', duration = 3000) {
    const messageBox = document.createElement('div');
    messageBox.className = `message-box fixed top-4 right-4 p-4 rounded-md shadow-lg text-white z-50 animate-fade-in-down`;
    if (type === 'success') messageBox.classList.add('bg-green-500');
    else if (type === 'error') messageBox.classList.add('bg-red-500');
    else if (type === 'warning') messageBox.classList.add('bg-yellow-500');
    else messageBox.classList.add('bg-blue-500');

    messageBox.textContent = message;
    document.body.appendChild(messageBox);

    setTimeout(() => {
      messageBox.classList.remove('animate-fade-in-down');
      messageBox.classList.add('animate-fade-out-up');
      messageBox.addEventListener('animationend', () => messageBox.remove());
    }, duration); // Message disappears after 'duration' milliseconds
  }

  updateUI() {
    // Update UI elements when user data changes
    const usernameEl = document.querySelector('.username');
    const levelEl = document.querySelector('.level');
    const coinsEl = document.querySelector('.coins');
    const wpmHubEl = document.querySelector('.hub-welcome .stat-value:nth-child(1)'); // WPM in hub
    const levelHubEl = document.querySelector('.hub-welcome .stat-value:nth-child(2)'); // Level in hub
    const coinsHubEl = document.querySelector('.hub-welcome .stat-value:nth-child(3)'); // Coins in hub
    const uidDisplayEl = document.querySelector('.hub-header .text-sm');


    if (usernameEl) usernameEl.textContent = this.userData?.username || 'User';
    if (levelEl) levelEl.textContent = `Level ${this.userData?.level || 1}`;
    if (coinsEl) coinsEl.textContent = `${this.userData?.coins || 0} coins`;

    // Update hub stats if elements exist
    if (wpmHubEl) wpmHubEl.textContent = this.userData?.wpm || 0;
    if (levelHubEl) levelHubEl.textContent = this.userData?.level || 1;
    if (coinsHubEl) coinsHubEl.textContent = this.userData?.coins || 0;
    if (uidDisplayEl) uidDisplayEl.textContent = `UID: ${this.currentUser?.uid || 'N/A'}`;
  }
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded fired, initializing ThunderType.');
  new ThunderType();
});
