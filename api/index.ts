import { buildApp } from '../backend/src/app.js';

let appInstance = null;

export default async function handler(req, res) {
  if (!appInstance) {
    const { app } = await buildApp();
    appInstance = app;
  }
  return appInstance(req, res);
}
