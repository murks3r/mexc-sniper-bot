FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Bun as root, make it globally available
RUN curl -fsSL https://bun.sh/install | bash \
    && mv /root/.bun/bin/bun /usr/local/bin/bun \
    && chmod +x /usr/local/bin/bun

# Install Rust toolchain (for backend-rust)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

# Make cargo available for all users
RUN cp -r /root/.cargo /home/node/.cargo 2>/dev/null || true \
    && chown -R node:node /home/node/.cargo 2>/dev/null || true

USER node
ENV PATH="/home/node/.cargo/bin:${PATH}"
