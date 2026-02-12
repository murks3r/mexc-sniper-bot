# MEXC Sniper Bot - Directory Structure

This document describes the final directory structure after the EC2 deployment merge and Docker context fixes.

## Root Level Structure

```
mexc-sniper-bot/
├── app/                          # Next.js App Router pages
├── backend-rust/                 # Rust backend service
│   ├── src/                      # Rust source code
│   │   ├── api/                  # API endpoints & routes
│   │   ├── core/                 # Business logic (trading, sniping, positions)
│   │   ├── storage/              # DynamoDB integration
│   │   ├── utils/                # Configuration & logging
│   │   └── main.rs               # Application entry point
│   ├── Cargo.toml                # Rust dependencies
│   ├── Dockerfile                # Multi-stage build for Rust backend
│   └── .dockerignore             # Backend-specific ignore rules
├── docs/                         # Documentation
│   ├── DIRECTORY_STRUCTURE.md    # This file
│   ├── EC2_DEPLOYMENT.md         # EC2 deployment guide
│   ├── RUST_*.md                 # Rust migration documentation
│   └── ...
├── scripts/                      # Utility scripts
│   ├── setup-dynamodb.sh         # DynamoDB setup
│   ├── deploy-ec2.sh             # EC2 deployment script
│   └── ...
├── public/                       # Static assets
├── src/                          # Frontend source (legacy, now in app/)
├── __tests__/                    # Frontend tests
├── Dockerfile.frontend           # Multi-stage build for Next.js frontend
├── docker-compose.prod.yml       # Production orchestration (frontend + backend + nginx)
├── nginx.conf                    # Nginx reverse proxy configuration
├── next.config.ts                # Next.js configuration (standalone output)
├── package.json                  # Frontend dependencies
├── bun.lock                      # Bun lockfile
├── .dockerignore                 # Root-level ignore rules
├── .env.example                  # Environment template
└── README.md                     # Project documentation
```

## Build Contexts

### Frontend Docker Build
- **Build Context**: `.` (repository root)
- **Dockerfile**: `Dockerfile.frontend`
- **Command**: `docker build -f Dockerfile.frontend -t mexc-frontend:latest .`
- **Key Files Copied**: 
  - `package.json`, `bun.lock`
  - All frontend source files from root
  - Excludes backend-rust/ (via .dockerignore)

### Backend Docker Build
- **Build Context**: `./backend-rust`
- **Dockerfile**: `backend-rust/Dockerfile`
- **Command**: `docker build -f backend-rust/Dockerfile -t mexc-backend:latest ./backend-rust`
- **Key Files Copied**:
  - `Cargo.toml`, `Cargo.lock`
  - `src/` directory with all Rust source

### Production Deployment
- **Orchestration**: `docker-compose.prod.yml`
- **Services**:
  1. **frontend**: Next.js on port 3000 (internal)
  2. **backend**: Rust API on port 8080 (internal)
  3. **nginx**: Reverse proxy on port 80 (public)

## Key Configuration Files

### next.config.ts
- `output: 'standalone'` - Creates minimal Docker-optimized build
- `experimental.outputFileTracingRoot: process.cwd()` - Ensures correct file tracing for monorepo-style layout

### Cargo.toml
- `time = "=0.3.36"` - Pinned for security/compatibility
- `aws-config = "1.1.0"` - AWS SDK configuration
- `aws-sdk-dynamodb = "1.12.0"` - DynamoDB client

### docker-compose.prod.yml
- Frontend build context: `.` (root)
- Backend build context: `./backend-rust`
- Nginx volume: `./nginx.conf:/etc/nginx/nginx.conf`
- Health checks enabled for backend

## Deployment Flow

1. **Build Images**:
   ```bash
   docker-compose -f docker-compose.prod.yml build
   ```

2. **Start Services**:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Verify**:
   - Frontend: http://localhost (proxied through nginx)
   - Backend API: http://localhost/api/
   - Direct backend: http://localhost:8080/health

## Environment Variables

Required environment variables are defined in `.env.example`:
- `MEXC_API_KEY` - MEXC exchange API key
- `MEXC_SECRET_KEY` - MEXC exchange secret
- `JWT_SECRET` - JWT signing secret
- `AWS_ACCESS_KEY_ID` - AWS credentials (for DynamoDB)
- `AWS_SECRET_ACCESS_KEY` - AWS secret
- `DATABASE_URL` - Database connection string (if applicable)

## CI/CD Integration

GitHub Actions workflows automatically:
1. Run `cargo check` and tests for backend
2. Build both Docker images
3. Push to ECR (if configured)
4. Deploy to EC2 instance

See `.github/workflows/` for workflow definitions.
