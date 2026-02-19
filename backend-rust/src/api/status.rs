use axum::{
    extract::State,
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::mexc::MexcClient;

/// Shared State für den Status-Endpunkt
pub struct StatusState {
    pub mexc_client: Arc<MexcClient>,
    /// Unix-Timestamp beim Start des Servers
    pub started_at: u64,
}

impl StatusState {
    pub fn new(mexc_client: Arc<MexcClient>) -> Self {
        let started_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        Self { mexc_client, started_at }
    }
}

#[derive(Serialize, Deserialize)]
pub struct BotStatus {
    pub status: String,
    pub version: String,
    pub uptime_seconds: u64,
    pub started_at: u64,
    pub timestamp: String,
    pub connections: ConnectionStatus,
    pub services: ServiceStatus,
}

#[derive(Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub mexc_api: ComponentHealth,
}

#[derive(Serialize, Deserialize)]
pub struct ComponentHealth {
    pub healthy: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ServiceStatus {
    pub trading: String,
    pub market_data: String,
    pub storage: String,
}

/// GET /api/v1/status – Vollständiger Bot-Status
pub async fn get_status(
    State(state): State<Arc<StatusState>>,
) -> (StatusCode, Json<BotStatus>) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let uptime = now.saturating_sub(state.started_at);

    // MEXC-Connectivity prüfen (schneller Ping via Ticker-Abfrage)
    let mexc_health = {
        let start = std::time::Instant::now();
        match state.mexc_client.get_ticker("BTCUSDT").await {
            Ok(_) => ComponentHealth {
                healthy: true,
                latency_ms: Some(start.elapsed().as_millis() as u64),
                error: None,
            },
            Err(e) => ComponentHealth {
                healthy: false,
                latency_ms: Some(start.elapsed().as_millis() as u64),
                error: Some(e.to_string()),
            },
        }
    };

    let overall_healthy = mexc_health.healthy;

    let body = BotStatus {
        status: if overall_healthy {
            "healthy".to_string()
        } else {
            "degraded".to_string()
        },
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: uptime,
        started_at: state.started_at,
        timestamp: chrono::Utc::now().to_rfc3339(),
        connections: ConnectionStatus {
            mexc_api: mexc_health,
        },
        services: ServiceStatus {
            trading: "operational".to_string(),
            market_data: "operational".to_string(),
            storage: "operational".to_string(),
        },
    };

    let http_status = if overall_healthy {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (http_status, Json(body))
}

/// GET /api/v1/settings – Bot-Einstellungen (read-only, aus Env-Vars)
pub async fn get_settings() -> Json<serde_json::Value> {
    use serde_json::json;
    Json(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "rust_api_port": std::env::var("RUST_API_PORT").unwrap_or_else(|_| "3009".to_string()),
        "dynamodb_table": std::env::var("DYNAMODB_TABLE").unwrap_or_else(|_| "MexcSniperOrders".to_string()),
        "log_level": std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
        "use_ssm": std::env::var("USE_SSM").unwrap_or_else(|_| "false".to_string()) == "true",
        "environment": std::env::var("NODE_ENV").unwrap_or_else(|_| "production".to_string()),
    }))
}

/// Router für V1 Endpunkte
pub fn status_router(state: Arc<StatusState>) -> Router {
    Router::new()
        .route("/status", get(get_status))
        .route("/settings", get(get_settings))
        .with_state(state)
}
