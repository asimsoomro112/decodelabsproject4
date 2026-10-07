// 'pg' is an OPTIONAL dependency for the SynapseBridge backend: it is loaded
// lazily at runtime inside createPgStore(), so the server installs and boots
// fine without it. This ambient declaration keeps typecheck green when the
// package is not installed.
declare module 'pg';
