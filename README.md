# Patient Portal - Medical Records Management System

A secure web application for patients to store, access, and visualize their medical records in PDF format.

## Features

- 🔐 **Secure Authentication** - JWT-based user authentication
- 📁 **PDF Upload & Storage** - Upload and store medical records
- 📊 **Data Visualization** - Extract and visualize medical data
- 📱 **Responsive Design** - Works on desktop and mobile devices
- 🔍 **PDF Viewer** - Built-in PDF viewing capabilities
- 📈 **Analytics Dashboard** - Medical data analysis and charts

## Tech Stack

- **Backend**: Node.js, Express.js, SQLite
- **Frontend**: React.js, Tailwind CSS
- **Authentication**: JWT, bcrypt
- **File Processing**: pdf-parse, multer
- **Charts**: Recharts
- **Icons**: Lucide React

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Local Development

1. **Clone and Install Dependencies**
   ```bash
   git clone <your-repo-url>
   cd patient-portal
   npm install
   cd client && npm install
   ```

2. **Start the Development Server**
   ```bash
   # Terminal 1 - Backend
   npm run dev
   
   # Terminal 2 - Frontend
   cd client && npm start
   ```

3. **Access the Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

### Demo Credentials
- **Username**: `admin`
- **Password**: `admin123`

## Free Deployment Options

### 1. Render (Recommended - Easiest)

1. **Create a Render Account**
   - Go to [render.com](https://render.com)
   - Sign up for a free account

2. **Connect Your Repository**
   - Connect your GitHub repository
   - Render will automatically detect the `render.yaml` configuration

3. **Deploy**
   - Click "Create New Service"
   - Select "Web Service"
   - Choose your repository
   - Render will automatically build and deploy

4. **Access Your App**
   - Your app will be available at: `https://your-app-name.onrender.com`

### 2. Railway

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Deploy**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Railway will auto-deploy

### 3. Vercel + Supabase

1. **Frontend (Vercel)**
   ```bash
   npm install -g vercel
   cd client
   vercel
   ```

2. **Backend (Supabase)**
   - Create account at [supabase.com](https://supabase.com)
   - Set up PostgreSQL database
   - Update database connection in server.js

## Environment Variables

Create a `.env` file in the root directory:

```env
NODE_ENV=development
PORT=3001
JWT_SECRET=your-secret-key-here
```

## API Endpoints

- `POST /api/login` - User login
- `POST /api/register` - User registration
- `POST /api/upload` - Upload PDF file
- `GET /api/records` - Get user's records
- `GET /api/records/:id` - Get specific record
- `GET /api/pdf/:filename` - Serve PDF file
- `GET /api/analyze/:id` - Analyze PDF data

## Project Structure

```
patient-portal/
├── server.js              # Express server
├── package.json           # Backend dependencies
├── render.yaml           # Render deployment config
├── client/               # React frontend
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── pages/        # Page components
│   │   ├── context/      # React context
│   │   └── App.js        # Main app component
│   └── package.json      # Frontend dependencies
└── uploads/              # PDF storage directory
```

## Security Features

- JWT token authentication
- Password hashing with bcrypt
- Rate limiting
- Helmet.js security headers
- CORS protection
- File upload validation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support, email support@patientportal.com or create an issue in the repository.

---

**Note**: This is a demo application. For production use, ensure proper security measures, HIPAA compliance, and data encryption are implemented. 