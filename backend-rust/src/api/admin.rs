use axum::{
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde_json::json;

/// Health Check Endpoint
pub async fn health() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "status": "healthy",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    )
}

/// Readiness Check Endpoint
pub async fn ready() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "ready": true,
            "version": env!("CARGO_PKG_VERSION"),
        })),
    )
}

/// Metrics Endpoint (wird später mit Prometheus gefüllt)
pub async fn metrics() -> (StatusCode, String) {
    // TODO: Prometheus metrics exportieren
    (StatusCode::OK, "# Metrics endpoint\n".to_string())
}

/// Router für Admin/Health Endpoints
pub fn admin_router() -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .route("/metrics", get(metrics))
}
