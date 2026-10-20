// Configuración general del sistema Vadim Strika.
// Este archivo es público (va en GitHub Pages). La protección real de los
// datos está en las reglas de Firestore (firestore.rules).

export const APP_VERSION = '0.1.1';

// Versión de la estructura de datos. Se sube cuando una fase agrega
// colecciones o campos nuevos. Debe coincidir con config/sistema en Firestore.
export const SCHEMA_VERSION = 1;

export const FIREBASE_SDK = '12.19.0';

export const firebaseConfig = {
  apiKey: 'AIzaSyBIxXLFINxWiWVOc29YmZe936DXEkWOtwc',
  authDomain: 'vadimstrika-sistema.firebaseapp.com',
  projectId: 'vadimstrika-sistema',
  storageBucket: 'vadimstrika-sistema.firebasestorage.app',
  messagingSenderId: '461574630857',
  appId: '1:461574630857:web:c52454ff739222b3458c18'
};

// Correos que pueden entrar. Si agregas o quitas uno aquí, haz el mismo
// cambio en firestore.rules y publica las reglas en la consola de Firebase.
export const CORREOS_PERMITIDOS = [
  'megustalacomidadelosaviones@gmail.com',
  'vadimstrikasistema@gmail.com'
];
