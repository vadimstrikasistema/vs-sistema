// Conexión con Firebase. Todo el resto de la app importa desde aquí,
// así la versión del SDK se cambia en un solo lugar (config.js).
import { firebaseConfig, FIREBASE_SDK } from './config.js';

const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}`;

const appMod = await import(`${base}/firebase-app.js`);
const authMod = await import(`${base}/firebase-auth.js`);
const fsMod = await import(`${base}/firebase-firestore.js`);

export const app = appMod.initializeApp(firebaseConfig);
export const auth = authMod.getAuth(app);
auth.languageCode = 'es';

// Caché local persistente: la app sigue funcionando sin señal (ferias)
// y sincroniza cuando vuelve la conexión.
let db;
try {
  db = fsMod.initializeFirestore(app, {
    // Un campo sin valor (undefined) se omite en vez de hacer fallar la escritura.
    ignoreUndefinedProperties: true,
    localCache: fsMod.persistentLocalCache({
      tabManager: fsMod.persistentMultipleTabManager()
    })
  });
} catch (e) {
  console.warn('Caché offline no disponible, se usa memoria', e);
  db = fsMod.getFirestore(app);
}
export { db };

export const {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} = authMod;

export const {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocFromServer,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  increment,
  query,
  where,
  orderBy,
  limit
} = fsMod;
