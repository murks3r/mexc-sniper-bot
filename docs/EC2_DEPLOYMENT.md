# EC2 Deployment Guide

## Overview

This guide explains how to deploy the MEXC Sniper Bot to an EC2 instance using Docker Compose with Nginx reverse proxy.

## Architecture

The production setup uses three Docker containers:

1. **Frontend** - Next.js application (port 3000)
2. **Backend** - Rust API server (port 8080)
3. **Nginx** - Reverse proxy (port 80)

```
Internet → Nginx (port 80) → Frontend (port 3000)
                           → Backend (port 8080)
```

## Prerequisites

- EC2 instance with Ubuntu 20.04+ or Amazon Linux 2
- Docker and Docker Compose installed
- At least 2GB RAM, 2 vCPUs recommended
- Security group with ports 80 and 443 open

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# Database
DATABASE_URL=your_database_url_here

# MEXC API Credentials
MEXC_API_KEY=your_mexc_api_key
MEXC_SECRET_KEY=your_mexc_secret_key

# Clerk Authentication (if using)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# Optional: Backend URL
NEXT_PUBLIC_API_URL=http://backend:8080
```

## Installation

### 1. Install Docker

```bash
# For Ubuntu
sudo apt update
sudo apt install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# For Amazon Linux 2
sudo yum update -y
sudo yum install -y docker
sudo service docker start
sudo systemctl enable docker
sudo usermod -aG docker $USER
```

### 2. Clone Repository

```bash
# Replace with your repository URL
git clone https://github.com/YOUR_USERNAME/mexc-sniper-bot.git
cd mexc-sniper-bot
```

### 3. Configure Environment

```bash
cp .env.example .env
nano .env  # Edit with your credentials
```

## Deployment

### One-Command Deployment

Use the deployment script for quick deployments:

```bash
./scripts/deploy-ec2.sh
```

This script will:
1. Build Docker images
2. Stop old containers
3. Start new containers
4. Run health checks

### Manual Deployment

For more control, use Docker Compose directly:

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop services
docker-compose -f docker-compose.prod.yml down
```

## Monitoring

### Check Service Status

```bash
docker-compose -f docker-compose.prod.yml ps
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f frontend
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f nginx
```

### Health Checks

The backend service includes automatic health checks:

```bash
# Check backend health
curl http://localhost/api/health

# Check Nginx status
curl http://localhost
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs <service-name>

# Rebuild from scratch
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

### Port Already in Use

```bash
# Check what's using port 80
sudo lsof -i :80

# Stop conflicting service
sudo systemctl stop apache2  # or nginx, etc.
```

### Database Connection Issues

1. Verify `DATABASE_URL` in `.env` is correct
2. Ensure database is accessible from EC2 instance
3. Check security groups allow database access
4. Verify credentials are correct

### Frontend Can't Reach Backend

1. Check `NEXT_PUBLIC_API_URL` is set to `http://backend:8080`
2. Verify backend container is running: `docker ps`
3. Check backend logs: `docker-compose -f docker-compose.prod.yml logs backend`

## SSL/HTTPS Setup

For production, you should add SSL certificates. Modify `nginx.conf`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # ... rest of config
}
```

Then mount certificates in `docker-compose.prod.yml`:

```yaml
nginx:
  volumes:
    - ./nginx.conf:/etc/nginx/nginx.conf
    - ./ssl:/etc/nginx/ssl:ro
```

## Updating

To deploy new changes:

```bash
git pull origin main
./scripts/deploy-ec2.sh
```

## Backup & Recovery

### Backup Database

```bash
# If using SQLite
docker-compose -f docker-compose.prod.yml exec backend \
  cp /app/data.db /app/backup-$(date +%Y%m%d).db

# If using PostgreSQL/MySQL
# Use appropriate backup commands for your database
```

### Restore from Backup

```bash
# Stop services
docker-compose -f docker-compose.prod.yml down

# Restore database
# ... restore your database backup

# Restart services
docker-compose -f docker-compose.prod.yml up -d
```

## Performance Optimization

### Resource Limits

Add resource limits to `docker-compose.prod.yml`:

```yaml
services:
  frontend:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

### Nginx Caching

Add caching to `nginx.conf` for static assets:

```nginx
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## Security Best Practices

1. **Never commit `.env` files** - they contain secrets
2. **Use strong passwords** for all services
3. **Enable HTTPS** in production
4. **Regularly update** Docker images and dependencies
5. **Use AWS Secrets Manager** for sensitive credentials
6. **Enable CloudWatch logging** for better monitoring
7. **Set up automated backups** for your database

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)

## Support

For issues or questions:
- Check existing issues: https://github.com/murks3r/mexc-sniper-bot/issues
- Create a new issue with deployment details and error logs
