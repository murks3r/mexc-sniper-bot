FROM rustlang/rust:nightly-bookworm as builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY . .
# Erstellt die Modul-Struktur, falls sie fehlt
RUN mkdir -p src/mexc/client && touch src/mexc/client/models.rs
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/mexc-sniper /app/mexc-sniper
CMD ["./mexc-sniper"]
