const express = require('express');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const FRONTEND_PORT = 3001;
const BACKEND_PORT = 3000;

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'instabid-c6e96d18036764b6a96e463fa22aa93148c6e877/frontend')));

// API proxy - forward requests to backend
app.use('/api', (req, res) => {
  const url = `http://localhost:${BACKEND_PORT}${req.url}`;

  fetch(url, {
    method: req.method,
    headers: req.headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
  })
  .then(response => response.json())
  .then(data => res.json(data))
  .catch(err => {
    console.error('API proxy error:', err);
    res.status(500).json({ error: 'Backend service unavailable' });
  });
});

// Serve frontend for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'instabid-c6e96d18036764b6a96e463fa22aa93148c6e877/frontend/index.html'));
});

// Start frontend server
app.listen(FRONTEND_PORT, () => {
  console.log(`\n✅ InstaBid Frontend Server running on http://localhost:${FRONTEND_PORT}`);
  console.log(`\n📱 Access the application at: http://localhost:${FRONTEND_PORT}`);
  console.log(`\n📊 Available pages:`);
  console.log(`   - Main Estimator: http://localhost:${FRONTEND_PORT}/index.html`);
  console.log(`   - Dashboard: http://localhost:${FRONTEND_PORT}/dashboard.html`);
  console.log(`   - Login: http://localhost:${FRONTEND_PORT}/login.html`);
  console.log(`   - Register: http://localhost:${FRONTEND_PORT}/register.html`);
  console.log(`   - Schedule: http://localhost:${FRONTEND_PORT}/schedule.html`);
});

// Start backend server
console.log('\n🚀 Starting InstaBid Backend Server...');
const backendProcess = spawn('node', ['server.js'], {
  cwd: path.join(__dirname, 'instabid-c6e96d18036764b6a96e463fa22aa93148c6e877/backend'),
  stdio: 'inherit'
});

backendProcess.on('error', (err) => {
  console.error('❌ Backend server error:', err);
  console.log('\n⚠️  Backend server failed to start. Frontend is still accessible.');
  console.log('   To start backend separately: cd instabid-c6e96d18036764b6a96e463fa22aa93148c6e877/backend && npm start');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down servers...');
  backendProcess.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Shutting down servers...');
  backendProcess.kill();
  process.exit(0);
});
