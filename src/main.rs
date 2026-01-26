use axum::{
    routing::get,
    Router,
    response::Json,
};
use std::net::SocketAddr;
use tracing_subscriber;
use std::collections::HashMap;

#[tokio::main]
async fn main() {
    // Initialize logging
    tracing_subscriber::fmt::init();
    
    // Build our application with routes
    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health_check));
    
    // Run server
    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    tracing::info!("Server starting on {}", addr);
    
    axum::serve(
        tokio::net::TcpListener::bind(addr).await.unwrap(),
        app
    ).await.unwrap();
}

async fn root() -> &'static str {
    "MEXC Sniper Bot Rust Backend"
}

async fn health_check() -> Json<HashMap<&'static str, &'static str>> {
    let mut status = HashMap::new();
    status.insert("status", "healthy");
    status.insert("service", "mexc-sniper-rust");
    Json(status)
}
