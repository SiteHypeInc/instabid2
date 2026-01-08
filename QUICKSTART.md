# InstaBid - Quick Deployment Guide

## ✅ COMPLETED SETUP

1. ✅ Database schema created in Supabase (10 tables)
2. ✅ Backend dependencies installed
3. ✅ Environment configuration files created
4. ✅ Deployment servers configured
5. ✅ Frontend is LIVE and accessible

## 🚀 CURRENT STATUS

**Frontend**: ✅ RUNNING at http://localhost:3001

**Backend**: ⏳ Waiting for database password configuration

## 📋 TO COMPLETE DEPLOYMENT (2 Minutes)

### Step 1: Get Your Supabase Database Password

Visit: https://supabase.com/dashboard/project/ajmnpaxhjlzkgprhfzgx/settings/database

Copy your database password from the "Database password" field.

### Step 2: Update Backend Configuration

Edit: `instabid-c6e96d18036764b6a96e463fa22aa93148c6e877/backend/.env`

Replace `[YOUR-DB-PASSWORD]` in the DATABASE_URL line with your actual password:

```bash
DATABASE_URL=postgresql://postgres.ajmnpaxhjlzkgprhfzgx:YOUR_ACTUAL_PASSWORD@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

### Step 3: Start Full Application

```bash
npm start
```

This starts both frontend (port 3001) and backend (port 3000).

## 🎯 ACCESS THE APPLICATION

Once fully running:

- **Main Estimator**: http://localhost:3001/index.html
- **Dashboard**: http://localhost:3001/dashboard.html
- **Login**: http://localhost:3001/login.html
- **Register**: http://localhost:3001/register.html
- **Schedule**: http://localhost:3001/schedule.html

## 📦 WHAT'S INCLUDED

**Trades Supported:**
- Roofing estimation
- HVAC estimation
- Electrical estimation
- Plumbing estimation
- Flooring estimation
- Painting estimation

**Features:**
- Regional pricing (by ZIP code)
- Material cost calculation
- Labor cost estimation
- Project scheduling
- Contractor dashboard
- Customer estimates
- PDF generation
- Email notifications (optional)
- Payment processing (optional)
- Google Calendar sync (optional)

## 🗄️ DATABASE TABLES

All tables created and ready:
- contractors
- contractor_sessions
- estimates
- labor_rates
- materials_cache
- pricing_cache
- zip_metro_mapping
- scheduled_jobs
- contractor_availability
- api_refresh_log

## ⚡ OPTIONAL FEATURES

Add these to `backend/.env` to enable:

```bash
# Email notifications
SENDGRID_API_KEY=your-key

# Payment processing
STRIPE_SECRET_KEY=your-key

# Google Calendar
GOOGLE_CLIENT_ID=your-id
GOOGLE_CLIENT_SECRET=your-secret
```

## 🆘 NEED HELP?

See full documentation: `DEPLOYMENT.md`
