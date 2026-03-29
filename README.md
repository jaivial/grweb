# GR Cup Raffle Application

A production-ready web application for the GR Cup powerlifting championship raffle, featuring scroll-driven video animations, real-time participant updates, and Stripe payment integration.

## 🏗️ Architecture

- **Frontend**: Preact 10 + TypeScript + Vite + Tailwind CSS v3.4
- **Backend**: ASP.NET Core 8 Minimal API + C#
- **Database**: MySQL 8 (via Pomelo.EntityFrameworkCore.MySql)
- **Real-time**: SignalR for live participant counter
- **Authentication**: JWT for admin panel
- **Payment**: Stripe Checkout

## 📋 Features

### Public Features
- **Hero Section**: Full-screen animated section with live participant counter
- **Rules Section**: Clear raffle rules and pricing (0.50€ per ticket)
- **How to Enter**: Step-by-step instructions
- **Winners Display**: Past winners showcase
- **Ticket Purchase**: Stripe Checkout integration
- **Real-time Counter**: Live participant count via SignalR

### Admin Features
- **Dashboard**: KPI cards (total participants, tickets sold, revenue)
- **Participant Management**: Paginated table with search and CSV export
- **Winner Draw**: Random selection with confirmation workflow
- **Draw History**: Complete audit trail of all draws

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- .NET 8 SDK
- MySQL 8
- Stripe account (test mode)

### Backend Setup

```bash
# Navigate to backend
cd backend/GrCup.Api

# Set environment variables
export JWT_SECRET="your-secret-key-at-least-32-characters-long"
export STRIPE_SECRET_KEY="sk_test_your_stripe_secret_key"
export STRIPE_PUBLISHABLE_KEY="pk_test_your_stripe_publishable_key"
export STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="strongpassword"

# Create MySQL database
mysql -u root -p
CREATE DATABASE grcup;
CREATE USER 'grcup_user'@'localhost' IDENTIFIED BY 'grcup_password';
GRANT ALL PRIVILEGES ON grcup.* TO 'grcup_user'@'localhost';
FLUSH PRIVILEGES;

# Run migrations
dotnet ef database update

# Start backend
dotnet run
```

Backend will run on `http://localhost:5006`

### Frontend Setup

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Create .env file
echo "VITE_API_URL=http://localhost:5006" > .env

# Start development server
npm run dev
```

Frontend will run on `http://localhost:5173`

### Stripe Webhook Setup (Local Development)

```bash
# Install Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Windows: scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git && scoop install stripe

# Login to Stripe
stripe login

# Forward webhooks to local backend
stripe listen --forward-to localhost:5006/api/webhooks/stripe

# Copy the webhook signing secret (whsec_...) and set as STRIPE_WEBHOOK_SECRET
```

## 🎨 Adding Video Frame Animations

The application supports scroll-driven video animations using image sequences.

### Folder Structure

Place your frame sequences in the frontend public directory:

```
frontend/public/frames/
├── hero/          # 60 frames: 001.jpg ... 060.jpg
├── rules/         # 50 frames: 001.jpg ... 050.jpg
├── how-to-enter/  # 40 frames: 001.jpg ... 040.jpg
└── winners/       # 30 frames: 001.jpg ... 030.jpg
```

### Frame Naming Convention

- Format: JPG (recommended) or PNG
- Naming: Three-digit zero-padded numbers (001.jpg, 002.jpg, etc.)
- Resolution: 1920x1080 or higher (will be scaled responsively)
- Optimization: Use WebP for smaller file sizes

### Implementation

The scroll animation system uses:
1. **Frame Preloader**: Loads frames progressively
2. **Scroll Progress Tracker**: Maps scroll position to frame number
3. **Canvas Renderer**: Displays frames at 60fps
4. **Parallax Layers**: Text overlays moving at different speeds

## 🗄️ Database Schema

### Participants Table
```sql
CREATE TABLE Participants (
    Id INT PRIMARY KEY AUTO_INCREMENT,
    FirstName VARCHAR(255) NOT NULL,
    Surname VARCHAR(255) NOT NULL,
    Email VARCHAR(255) UNIQUE NOT NULL,
    Instagram VARCHAR(255) NOT NULL,
    TicketCount INT NOT NULL,
    TotalPaid DECIMAL(10,2) NOT NULL,
    CreatedAt DATETIME NOT NULL
);
```

### Draws Table
```sql
CREATE TABLE Draws (
    Id INT PRIMARY KEY AUTO_INCREMENT,
    WinnerEmail VARCHAR(255) NOT NULL,
    WinnerName VARCHAR(255),
    WinnerInstagram VARCHAR(255),
    WinnerTicketCount INT,
    DrawDate DATETIME NOT NULL,
    Notes TEXT,
    IsConfirmed BOOLEAN NOT NULL
);
```

## 🔌 API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tickets/buy` | Create Stripe checkout session |
| GET | `/api/participants/count` | Get total participant count |
| GET | `/api/config/stripe` | Get Stripe publishable key |
| POST | `/api/webhooks/stripe` | Handle Stripe webhooks |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/verify` | Verify JWT token |
| GET | `/api/admin/statistics` | Dashboard KPIs |
| GET | `/api/admin/participants` | Paginated participants list |
| GET | `/api/admin/export/csv` | Export participants to CSV |
| POST | `/api/admin/draw` | Draw random winner |
| POST | `/api/admin/draw/{id}/confirm` | Confirm winner |
| GET | `/api/admin/draws` | Get draw history |
| DELETE | `/api/admin/draw/{id}` | Void a draw |

## 🔐 Environment Variables

### Backend (.env or system)

```bash
# Required
JWT_SECRET=your-secret-key-at-least-32-characters-long
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Optional (defaults provided)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=strongpassword
```

### Frontend (.env)

```bash
VITE_API_URL=http://localhost:5006
```

## 📦 Deployment

### Frontend (Vercel/Netlify)

```bash
# Build frontend
cd frontend
npm run build

# Deploy dist/ folder to Vercel/Netlify
# Set environment variables in dashboard:
# VITE_API_URL=https://your-backend-url.com
```

### Backend (Railway/Render)

1. **Create Dockerfile** (already configured)
2. **Set environment variables** in platform dashboard
3. **Configure MySQL database** (Railway/Render provide managed MySQL)
4. **Run migrations** on first deploy:
   ```bash
   dotnet ef database update
   ```
5. **Configure Stripe webhook** in Stripe Dashboard:
   - URL: `https://your-backend-url.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`

### Production Checklist

- [ ] Change `ADMIN_PASSWORD` from default
- [ ] Set strong `JWT_SECRET` (256-bit minimum)
- [ ] Configure production MySQL database
- [ ] Switch Stripe from test to live mode
- [ ] Update CORS origins to production domains
- [ ] Enable HTTPS enforcement
- [ ] Set up database backups
- [ ] Configure monitoring (optional: Sentry, DataDog)

## 🧪 Testing

### Stripe Testing

Use Stripe test card numbers:
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **Require authentication**: `4000 0025 0000 3155`

Any future expiry date and any 3-digit CVC.

### Admin Login (Default)

- **Username**: `admin`
- **Password**: `strongpassword`

## 🐛 Troubleshooting

### Database Connection Error
```
Check:
1. MySQL is running
2. Connection string is correct
3. User has proper permissions
4. Database exists
```

### Stripe Webhook Not Received
```
Check:
1. Stripe CLI is running
2. Webhook secret is correct
3. Backend is accessible
4. Check Stripe Dashboard logs
```

### SignalR Connection Failed
```
Check:
1. Backend CORS configuration
2. API_URL is correct
3. Browser console for errors
```

## 📄 License

This project is proprietary software for GR Strength.

## 🤝 Support

For technical support or questions, contact the development team.

---

Built with ❤️ for the powerlifting community
