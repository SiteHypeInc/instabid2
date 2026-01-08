# InstaBid Deployment Guide

## Application Overview

**InstaBid** is a multi-trade construction estimator supporting 6 trades:
- Roofing
- HVAC
- Electrical
- Plumbing
- Flooring
- Painting

## Quick Start (3 Steps)

### Step 1: Configure Database Connection

The application uses Supabase PostgreSQL. You need to add your database password to the backend `.env` file.

1. Get your Supabase database password:
   - Go to https://supabase.com/dashboard/project/ajmnpaxhjlzkgprhfzgx/settings/database
   - Copy your database password

2. Update the DATABASE_URL in `instabid-c6e96d18036764b6a96e463fa22aa93148c6e877/backend/.env`:

```bash
DATABASE_URL=postgresql://postgres.ajmnpaxhjlzkgprhfzgx:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

Replace `[YOUR-PASSWORD]` with your actual Supabase database password.

### Step 2: Install Dependencies (if not already done)

```bash
npm run build
```

This installs all backend dependencies automatically.

### Step 3: Start the Application

```bash
npm start
```

The application will be available at:
- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:3000

## Application Pages

Once running, access these pages:

- **Main Estimator**: http://localhost:3001/index.html
- **Contractor Dashboard**: http://localhost:3001/dashboard.html
- **Login**: http://localhost:3001/login.html
- **Register**: http://localhost:3001/register.html
- **Schedule**: http://localhost:3001/schedule.html

## Database Setup

✅ **Database schema already created!** The following tables are ready:

- `contractors` - Contractor accounts
- `contractor_sessions` - Authentication sessions
- `estimates` - Project estimates
- `labor_rates` - Regional labor rates
- `materials_cache` - Material pricing data
- `pricing_cache` - Regional pricing factors
- `zip_metro_mapping` - Geographic data
- `scheduled_jobs` - Calendar integration
- `contractor_availability` - Availability tracking
- `api_refresh_log` - API sync logs

## Optional Integrations

### Email Notifications (SendGrid)

Add to `backend/.env`:
```bash
SENDGRID_API_KEY=your-sendgrid-api-key
```

### Payment Processing (Stripe)

Add to `backend/.env`:
```bash
STRIPE_SECRET_KEY=your-stripe-secret-key
```

### Google Calendar Integration

Add to `backend/.env`:
```bash
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

## Production Deployment

### Option 1: Cloud Platform (Heroku, Railway, Render)

1. Set environment variable `DATABASE_URL` in your platform
2. Deploy the entire project folder
3. The start script will handle both frontend and backend

### Option 2: Separate Frontend/Backend

**Frontend** (Static hosting - Netlify, Vercel, S3):
- Deploy contents of `instabid-c6e96d18036764b6a96e463fa22aa93148c6e877/frontend/`

**Backend** (Node.js hosting):
- Deploy `instabid-c6e96d18036764b6a96e463fa22aa93148c6e877/backend/`
- Set environment variables
- Run `npm start`

### Option 3: Supabase Edge Functions

Convert backend endpoints to Edge Functions for serverless deployment (requires code adaptation).

## Troubleshooting

### Backend fails to start
- Check DATABASE_URL is correctly configured
- Verify Supabase database is accessible
- Check if port 3000 is available

### Frontend can't reach backend
- Ensure backend is running on port 3000
- Check CORS settings in backend/server.js
- Update frontend API endpoint if needed

### Database connection errors
- Verify DATABASE_URL format
- Check Supabase database password
- Ensure database is not paused (free tier)

## Architecture

```
project/
├── server.js                    # Main deployment server
├── package.json                 # Root package config
├── instabid-.../
│   ├── frontend/               # Static HTML/CSS/JS
│   │   ├── index.html         # Main estimator
│   │   ├── dashboard.html     # Contractor dashboard
│   │   ├── login.html         # Authentication
│   │   └── ...
│   └── backend/               # Node.js API server
│       ├── server.js          # Express API
│       ├── package.json       # Backend dependencies
│       └── .env              # Configuration
```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review backend logs for error messages
3. Verify all environment variables are set correctly
