// js/config.js
// PLACEHOLDER: Replace this with your actual Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyBJXTO-F_M5k0gh2O-FnzGf7wt7ieKk54g",
    authDomain: "eidi-a4dd7.firebaseapp.com",
    projectId: "eidi-a4dd7",
    storageBucket: "eidi-a4dd7.firebasestorage.app",
    messagingSenderId: "678355207624",
    appId: "1:678355207624:web:1e1b98eef2b7b02c8e6cfd",
};

// Expose minimal config globally; App logic will initialize via module methods imported in index.html
window.appConfig = {
    firebaseConfig,
    baseAmount: 10,
    vvipNames: ["muktadir", "raihan", "mithi", "fariya", "sihan"], // Hardcoded list of VVIPs (case insensitive)
};
