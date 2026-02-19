mod api;
mod mexc;
mod storage;
mod trading;
mod utils;

#[cfg(test)]
mod tests;

use axum::{
    middleware,
    routing::get,
    Router,
};
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    utils::init_logging();

    let config = utils::Config::load().await;

    tracing::info!(
        "Starting MEXC Sniper Bot (Rust) on port {}",
        config.rust_api_port
    );

    // Initialize storage layer
    let store = Arc::new(storage::DynamoDBStore::new(config.dynamodb_table.clone()).await?);

    // Initialize MEXC client
    let mexc_client = Arc::new(mexc::MexcClient::new(&config)?);

    // Initialize metrics
    let _metrics = Arc::new(utils::Metrics::new());

    // Create application state for each router
    let trading_state = Arc::new(api::TradingState {
        mexc_client: mexc_client.clone(),
        store: store.clone(),
    });

    let market_state = Arc::new(api::MarketState {
        mexc_client: mexc_client.clone(),
    });

    let status_state = Arc::new(api::StatusState::new(mexc_client.clone()));

    // Build routers
    let app = Router::new()
        // Health & Admin Routes
        .nest("/api/admin", api::admin_router())
        // Trading Routes
        .nest("/api/trade", api::trading_router(trading_state))
        // Market Data Routes
        .nest("/api/market", api::market_router(market_state))
        // V1 Status & Settings Routes
        .nest("/api/v1", api::status_router(status_state))
        // Root health check
        .route("/health", get(health_check))
        // Global middleware
        .layer(
            ServiceBuilder::new()
                .layer(CorsLayer::permissive())
                .layer(middleware::from_fn(logging_middleware)),
        );

    // Start server
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", config.rust_api_port))
        .await?;

    tracing::info!("Server listening on port {}", config.rust_api_port);

    axum::serve(listener, app).await?;

    Ok(())
}

/// Health check endpoint
async fn health_check() -> &'static str {
    "OK"
}

/// Logging middleware
async fn logging_middleware(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let method = req.method().clone();
    let uri = req.uri().clone();

    let start = std::time::Instant::now();
    let response = next.run(req).await;
    let duration = start.elapsed();

    tracing::info!(
        method = %method,
        uri = %uri,
        status = response.status().as_u16(),
        duration_ms = duration.as_millis(),
        "Request completed"
    );

    response
}
