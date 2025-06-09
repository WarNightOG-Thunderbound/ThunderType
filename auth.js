// auth.js
import { auth, db } from './firebase';
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ref, set } from "firebase/database";

// TCaptcha implementations
const TCaptchas = {
  math: () => {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    return {
      question: `What is ${a} + ${b}?`,
      answer: a + b
    };
  },
  reverse: () => {
    const word = ['apple', 'banana', 'cherry', 'date', 'fig'][Math.floor(Math.random() * 5)];
    return {
      question: `Reverse this word: ${word}`,
      answer: word.split('').reverse().join('')
    };
  },
  emoji: () => {
    const emojis = ['🐶', '🐱', '🐭', '🐹', '🐰'];
    const index = Math.floor(Math.random() * emojis.length);
    return {
      question: `Type the animal for this emoji: ${emojis[index]}`,
      answer: ['dog', 'cat', 'mouse', 'hamster', 'rabbit'][index]
    };
  }
};

async function registerWithEmail(email, password, username, captchaAnswers) {
  try {
    // Verify TCaptchas first
    const captchaResults = captchaAnswers.map((answer, i) => {
      const captcha = TCaptchas[Object.keys(TCaptchas)[i]]();
      return answer.toString().toLowerCase() === captcha.answer.toString().toLowerCase();
    });
    
    if (captchaResults.some(result => !result)) {
      throw new Error("One or more TCaptcha answers are incorrect");
    }

    // Create user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Set username
    await updateProfile(userCredential.user, {
      displayName: username
    });

    // Initialize user data in Realtime Database
    const userId = userCredential.user.uid;
    const userRef = ref(db, `users/${userId}`);
    
    await set(userRef, {
      username,
      email,
      level: 1,
      coins: 100,
      wpm: 0,
      tier: 'bronze',
      createdAt: Date.now(),
      lastActive: Date.now(),
      contacts: {},
      groups: {},
      unlockedThemes: ['default'],
      currentTheme: 'default',
      devicePerformance: detectDevicePerformance()
    });

    return userCredential;
  } catch (error) {
    throw error;
  }
}

function detectDevicePerformance() {
  // Simple detection based on hardwareConcurrency and deviceMemory
  const cores = navigator.hardwareConcurrency || 2;
  const memory = navigator.deviceMemory || 2;
  
  if (cores <= 2 && memory <= 2) return 'low-end';
  if (cores <= 4 && memory <= 4) return 'mid-end';
  return 'high-end';
}

export { registerWithEmail, TCaptchas };
