# Build Stage - Multi-stage for minimal final image
FROM rust:1.75 as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    musl-tools \
    && rm -rf /var/lib/apt/lists/*

# Add musl target for static linking
RUN rustup target add x86_64-unknown-linux-musl

COPY Cargo.toml Cargo.lock ./
COPY src ./src

# Build with musl for maximum compatibility and performance
ENV RUSTFLAGS="-C target-feature=+crt-static"
RUN cargo build --release --target x86_64-unknown-linux-musl

# Runtime Stage - Minimal final image
FROM alpine:3.18

RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/mexc-sniper /app/mexc-sniper

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8080/health || exit 1

# Environment defaults
ENV RUST_API_PORT=8080
ENV AWS_REGION=ap-southeast-1
ENV RUST_LOG=info

EXPOSE 8080

# Run application
CMD ["/app/mexc-sniper"]
