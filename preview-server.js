const express = require('express');
const path = require('path');

const app = express();
const PORT = 3001;

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, 'instabid-c6e96d18036764b6a96e463fa22aa93148c6e877/frontend')));

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'instabid-c6e96d18036764b6a96e463fa22aa93148c6e877/frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`
🚀 InstaBid Preview Server Running!

   📱 Frontend: http://localhost:${PORT}

   Available pages:
   - Main Estimator: http://localhost:${PORT}/
   - Dashboard: http://localhost:${PORT}/dashboard.html
   - Login: http://localhost:${PORT}/login.html
   - Register: http://localhost:${PORT}/register.html
   - Schedule: http://localhost:${PORT}/schedule.html

   Note: The app uses an external API at Railway for backend functionality.
  `);
});
