// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDq8efgFjoLFyiJOvM7pJEUOAgr5NSrHqo",
  authDomain: "thundertype-7ba0d.firebaseapp.com",
  projectId: "thundertype-7ba0d",
  storageBucket: "thundertype-7ba0d.appspot.com",
  messagingSenderId: "38206745209",
  appId: "1:38206745209:web:d1a3dba72aa5c0466a42a8",
  databaseURL: "https://thundertype-7ba0d-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

export { auth, db, storage };
